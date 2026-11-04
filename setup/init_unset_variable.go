package setup

import "slices"

// initUnsetVariables returns the variables command references that are neither set in env,
// assigned earlier in the command, one of the shell's own, nor given a default, once each in
// the order of their first refused reference. It scans the text without running it.
func initUnsetVariables(command string, env []string) []string {
	set := map[string]bool{}
	for _, entry := range env {
		name := entry
		for i := 0; i < len(entry); i++ {
			if entry[i] == '=' {
				name = entry[:i]
				break
			}
		}
		set[name] = true
	}
	var unset []string
	refuse := func(name string) {
		if name == "" || set[name] || slices.Contains(unset, name) {
			return
		}
		switch name {
		case "HOME", "PWD", "PATH", "USER":
			return
		}
		unset = append(unset, name)
	}
	name := func(at int) string {
		end := at
		for end < len(command) {
			c := command[end]
			if c == '_' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || end > at && c >= '0' && c <= '9' {
				end++
				continue
			}
			break
		}
		return command[at:end]
	}
	isSpace := func(c byte) bool { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\v' || c == '\f' }
	boundary := true
	single, double := false, false
	for i := 0; i < len(command); i++ {
		c := command[i]
		if single {
			if c == '\'' {
				single = false
			}
			boundary = false
			continue
		}
		atBoundary := boundary
		boundary = isSpace(c) || c == ';' || c == '&' || c == '|' || c == '(' || c == ')'
		if atBoundary {
			if n := name(i); n != "" && i+len(n) < len(command) && command[i+len(n)] == '=' {
				set[n] = true
			} else if n == "for" && i+3 < len(command) && isSpace(command[i+3]) {
				j := i + 3
				for j < len(command) && isSpace(command[j]) {
					j++
				}
				if v := name(j); v != "" {
					set[v] = true
				}
			}
		}
		switch {
		case c == '\\':
			i++
		case c == '\'' && !double:
			single = true
		case c == '"':
			double = !double
		case c == '$' && i+1 < len(command):
			if n := name(i + 1); n != "" {
				refuse(n)
			} else if command[i+1] == '{' {
				n := name(i + 2)
				rest := command[i+2+len(n):]
				defaulted := len(rest) > 0 && (rest[0] == '-' || rest[0] == '=' ||
					len(rest) > 1 && rest[0] == ':' && (rest[1] == '-' || rest[1] == '='))
				if !defaulted {
					refuse(n)
				}
			}
		}
	}
	return unset
}
