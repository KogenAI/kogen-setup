package setup

import (
	"regexp"
	"sort"
	"strings"
)

var credentialName = regexp.MustCompile(`(?i)(^|[^a-z0-9])(token|secret|password|passwd|api[-_]?key|authorization|bearer)([^a-z0-9]|$)`)
var authTokenName = regexp.MustCompile(`(?i)(^|[^a-z0-9])_?authtoken$`)
var credentialURL = regexp.MustCompile(`(?i)[a-z][a-z0-9+.-]*://[^\s/@:]+:([^\s/@]+)@[^\s/]+`)
var environmentValue = regexp.MustCompile(`^\$(?:[a-zA-Z_][a-zA-Z0-9_]*|\{[a-zA-Z_][a-zA-Z0-9_]*\})$`)

type credentialSpan struct{ start, end int }

// initCredentialLiteral finds values while retaining their original shell syntax.
func initCredentialLiteral(command string) (string, bool) {
	var spans []credentialSpan
	add := func(start, end int) {
		for start < end && (command[start] == '\'' || command[start] == '"') {
			start++
		}
		for end > start && (command[end-1] == '\'' || command[end-1] == '"') {
			end--
		}
		if start < end && !environmentValue.MatchString(command[start:end]) {
			spans = append(spans, credentialSpan{start, end})
		}
	}
	for _, m := range credentialURL.FindAllStringSubmatchIndex(command, -1) {
		add(m[2], m[3])
	}
	// Shell words retain their offsets; quotes group spaces but remain in the word.
	var words []credentialSpan
	for i := 0; i < len(command); {
		if strings.ContainsRune(" \t\r\n;|&", rune(command[i])) {
			i++
			continue
		}
		start := i
		var quote byte
		for i < len(command) {
			c := command[i]
			if c == '\\' && quote != '\'' && i+1 < len(command) {
				i += 2
				continue
			}
			if quote != 0 {
				if c == quote {
					quote = 0
				}
				i++
				continue
			}
			if c == '\'' || c == '"' {
				quote = c
				i++
				continue
			}
			if strings.ContainsRune(" \t\r\n;|&", rune(c)) {
				break
			}
			i++
		}
		words = append(words, credentialSpan{start, i})
	}
	isName := func(s string) bool { return credentialName.MatchString(s) || authTokenName.MatchString(s) }
	for i, w := range words {
		text := command[w.start:w.end]
		trimmed := strings.Trim(text, "\"'")
		if environmentValue.MatchString(trimmed) {
			continue
		}
		// A quoted HTTP header is a single shell word. A name containing "=" is
		// an assignment or flag whose whole value follows the "=".
		if colon := strings.Index(trimmed, ":"); colon >= 0 && !strings.Contains(trimmed[:colon], "=") && isName(trimmed[:colon]) {
			offset := strings.Index(text, trimmed) + colon + 1
			for offset < len(text) && (text[offset] == ' ' || text[offset] == '\t') {
				offset++
			}
			if strings.HasPrefix(strings.ToLower(text[offset:]), "bearer ") {
				offset += len("bearer ")
			}
			add(w.start+offset, w.end)
			continue
		}
		if eq := strings.IndexByte(text, '='); eq >= 0 {
			if isName(strings.Trim(text[:eq], "\"'")) {
				add(w.start+eq+1, w.end)
			}
		} else if isName(trimmed) && i+1 < len(words) {
			next := words[i+1]
			// A separator ends a command, not a name/value pair.
			if !strings.ContainsAny(command[w.end:next.start], ";|&\n\r") {
				add(next.start, next.end)
			}
		}
	}
	if len(spans) == 0 {
		return command, false
	}
	sort.Slice(spans, func(i, j int) bool { return spans[i].start < spans[j].start })
	var b strings.Builder
	end := 0
	for _, s := range spans {
		if s.start < end {
			continue
		}
		b.WriteString(command[end:s.start])
		b.WriteString("***")
		end = s.end
	}
	b.WriteString(command[end:])
	return b.String(), true
}
