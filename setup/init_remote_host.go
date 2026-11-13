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
// only literal command words and literal targets; anything else names no host.
func initContactsRemoteHost(command string) bool {
	for _, words := range initCommandParts(command) {
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
		if !strings.HasPrefix(arg, "-") && initRemoteURL(arg) {
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
