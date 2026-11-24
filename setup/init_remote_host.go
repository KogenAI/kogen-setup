package setup

import (
	"regexp"
	"strings"
	"unicode"
)

var (
	initURLSchemeRE = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9+.-]*://`)
	initSCPTargetRE = regexp.MustCompile(`^[^/:@\s]+@([^/:\s]+):`)
)

// initContactsRemoteHost reports whether a part of command runs curl, wget, ping, nc, telnet,
// ssh or git ls-remote against a host that is neither loopback nor a local path. It reads
// only literal command words and literal targets, skipping the transparent literal
// prefixes sudo, env, command and time; anything else names no host.
func initContactsRemoteHost(command string) bool {
	outer, _, nested := initScanRemoteSubstitutions(command, false, false)
	return nested || initPartsContactRemoteHost(initCommandParts(outer))
}

func initSubstitutionContactsRemoteHost(command string) bool {
	_, _, nested := initScanRemoteSubstitutions(command, false, false)
	return nested
}

func initPartsContactRemoteHost(parts [][]string) bool {
	for _, words := range parts {
		for len(words) > 0 && (words[0] == "sudo" || words[0] == "env" || words[0] == "command" || words[0] == "time") {
			words = words[1:]
		}
		if len(words) == 0 {
			continue
		}
		var args []string
		for _, w := range words[1:] {
			args = append(args, initUnquote(w))
		}
		switch words[0] {
		case "curl", "wget":
			if initAnyRemoteURL(args) {
				return true
			}
		case "git":
			if len(words) > 1 && words[1] == "ls-remote" && initAnyRemoteGit(args[1:]) {
				return true
			}
		case "ping", "nc", "telnet", "ssh":
			if initRemotePositional(args) {
				return true
			}
		}
	}
	return false
}

// initScanRemoteSubstitutions discovers literal shell substitutions without expanding
// any word. It masks each completed substitution in the parent so that its text is
// classified only in its own command context. end is the matching close, when wanted.
func initScanRemoteSubstitutions(src string, paren, inSubstitution bool) (outer string, end int, remote bool) {
	var out strings.Builder
	var quote byte
	var groupDepth int
	wordStart := true
	for i := 0; i < len(src); i++ {
		c := src[i]
		rest := src[i+1:]
		switch {
		case quote == '\'':
			if c == quote {
				quote = 0
			}
		case c == '\\' && len(rest) > 0 && (quote == 0 || strings.ContainsRune("$`\"\\\n", rune(rest[0]))):
			out.WriteString(src[i : i+2])
			if rest[0] != '\n' {
				wordStart = false
			}
			i++
			continue
		case c == '"':
			if quote == '"' {
				quote = 0
			} else {
				quote = '"'
			}
		case quote == 0 && c == '\'':
			quote = c
		case quote == 0 && c == '#' && wordStart:
			n := strings.IndexByte(src[i:], '\n')
			if n < 0 {
				n = len(src) - i
			}
			if !inSubstitution {
				out.WriteString(src[i : i+n])
			}
			i += n - 1
			continue
		case c == '$' && strings.HasPrefix(rest, "$"):
			out.WriteString("$$")
			i++
			wordStart = false
			continue
		case c == '$' && strings.HasPrefix(rest, "("):
			body, n, deeper := initScanRemoteSubstitutions(src[i+2:], true, true)
			if n < 0 {
				out.WriteString(src[i:])
				return out.String(), -1, remote
			}
			// Arithmetic expansion is not a command, but may contain one.
			remote = remote || deeper || (!strings.HasPrefix(rest, "((") && initPartsContactRemoteHost(initCommandParts(body)))
			out.WriteString("$()")
			i += n + 2
			wordStart = false
			continue
		case c == '`':
			if raw, n := initBackquoteBody(rest); n >= 0 {
				body, _, deeper := initScanRemoteSubstitutions(raw, false, true)
				remote = remote || deeper || initPartsContactRemoteHost(initCommandParts(body))
				out.WriteString("$()")
				i += n + 1
				wordStart = false
				continue
			}
		case quote == 0 && c == '(':
			groupDepth++
		case quote == 0 && c == ')':
			if groupDepth > 0 {
				groupDepth--
			} else if paren {
				return out.String(), i, remote
			}
		}
		out.WriteByte(c)
		wordStart = quote == 0 && strings.ContainsRune(" \t\n;|&()<>", rune(c))
	}
	return out.String(), -1, remote
}

func initBackquoteBody(src string) (string, int) {
	var body strings.Builder
	for i := 0; i < len(src); i++ {
		c := src[i]
		if c == '`' {
			return body.String(), i
		}
		if c == '\\' && i+1 < len(src) && strings.ContainsRune("$`\\\n", rune(src[i+1])) {
			i++
			c = src[i]
			if c == '\n' {
				continue
			}
		}
		body.WriteByte(c)
	}
	return "", -1
}

// initCommandParts splits command outside quotes on ; & | and newline into whitespace
// separated words. Words keep their quotes, so a quoted word is never a literal command word.
func initCommandParts(command string) [][]string {
	var parts [][]string
	var words []string
	var word strings.Builder
	var quote rune
	escaped := false
	flushWord := func() {
		if word.Len() > 0 {
			words = append(words, word.String())
			word.Reset()
		}
	}
	flushPart := func() {
		flushWord()
		parts = append(parts, words)
		words = nil
	}
	for _, r := range command {
		switch {
		case escaped:
			word.WriteRune(r)
			escaped = false
		case r == '\\' && quote != '\'':
			word.WriteRune(r)
			escaped = true
		case quote != 0:
			word.WriteRune(r)
			if r == quote {
				quote = 0
			}
		case r == '\'' || r == '"':
			quote = r
			word.WriteRune(r)
		case r == ';' || r == '&' || r == '|' || r == '\n':
			flushPart()
		case unicode.IsSpace(r):
			flushWord()
		default:
			word.WriteRune(r)
		}
	}
	flushPart()
	return parts
}

func initUnquote(word string) string {
	if len(word) >= 2 && (word[0] == '"' || word[0] == '\'') && word[len(word)-1] == word[0] {
		return word[1 : len(word)-1]
	}
	return word
}

func initLoopbackHost(host string) bool {
	switch strings.ToLower(strings.Trim(host, "[]")) {
	case "localhost", "127.0.0.1", "::1", "0.0.0.0":
		return true
	}
	return false
}

// initDynamic reports text the shell expands, which names no literal host.
func initDynamic(s string) bool {
	return strings.ContainsAny(s, "$`(){}*?")
}

// initRemoteURL reports a URL with a scheme whose host is not loopback and that is not a file URL.
func initRemoteURL(arg string) bool {
	loc := initURLSchemeRE.FindStringIndex(arg)
	if loc == nil || strings.EqualFold(arg[:loc[1]], "file://") {
		return false
	}
	authority := arg[loc[1]:]
	if i := strings.IndexAny(authority, "/?#"); i >= 0 {
		authority = authority[:i]
	}
	if i := strings.LastIndex(authority, "@"); i >= 0 {
		authority = authority[i+1:]
	}
	host := authority
	if strings.HasPrefix(host, "[") {
		if i := strings.Index(host, "]"); i >= 0 {
			host = host[:i+1]
		}
	} else if i := strings.LastIndex(host, ":"); i >= 0 {
		host = host[:i]
	}
	if host == "" || initDynamic(host) {
		return false
	}
	return !initLoopbackHost(host)
}

func initAnyRemoteURL(args []string) bool {
	for _, arg := range args {
		if strings.HasPrefix(arg, "-") {
			_, value, ok := strings.Cut(arg, "=")
			if !ok {
				continue
			}
			arg = initUnquote(value)
		}
		if initRemoteURL(arg) {
			return true
		}
	}
	return false
}

func initAnyRemoteGit(args []string) bool {
	for _, arg := range args {
		if strings.HasPrefix(arg, "-") {
			continue
		}
		if initRemoteURL(arg) {
			return true
		}
		if m := initSCPTargetRE.FindStringSubmatch(arg); m != nil && !initDynamic(m[1]) && !initLoopbackHost(m[1]) {
			return true
		}
	}
	return false
}

// initRemotePositional checks the first positional argument that is not purely numeric.
func initRemotePositional(args []string) bool {
	for _, arg := range args {
		if arg == "" || strings.HasPrefix(arg, "-") || strings.Trim(arg, "0123456789") == "" {
			continue
		}
		if i := strings.LastIndex(arg, "@"); i >= 0 {
			arg = arg[i+1:]
		}
		if arg == "" || strings.Contains(arg, "/") || initDynamic(arg) {
			return false
		}
		return !initLoopbackHost(arg)
	}
	return false
}
