package setup

import (
	"encoding/json"
	"regexp"
	"slices"
	"strings"

	"github.com/KogenAI/kogen-coordinator/project"
)

// initSelectOverlap only removes work proved redundant by committed root scripts.
// It runs after verification so a failed covering command cannot suppress a passing one.
func initSelectOverlap(setup []string, checks []project.Check, detectedSetup []string, manifests map[string]string, tracked []string) ([]string, []project.Check) {
	var pkg struct {
		Scripts map[string]string `json:"scripts"`
	}
	if json.Unmarshal([]byte(manifests["package.json"]), &pkg) != nil {
		return setup, checks
	}
	script := func(command string) (string, string) {
		fields := strings.Fields(command)
		name := ""
		if len(fields) == 2 && fields[0] == "npm" && fields[1] == "test" {
			name = "test"
		}
		if len(fields) == 3 && fields[0] == "npm" && fields[1] == "run" {
			name = fields[2]
		}
		if name == "" || pkg.Scripts["pre"+name] != "" || pkg.Scripts["post"+name] != "" {
			return "", ""
		}
		return name, pkg.Scripts[name]
	}
	// Only a simple unconditional chain establishes that preparation runs.
	for _, prep := range detectedSetup {
		if !slices.Contains(setup, prep) {
			continue
		}
		for i, command := range setup {
			// Do not move preparation past intervening setup effects.
			if i == 0 || setup[i-1] != prep {
				continue
			}
			_, body := script(command)
			parts := strings.Split(body, "&&")
			if len(parts) < 2 || initCommandKey(parts[0]) != initCommandKey(prep) {
				continue
			}
			simple := true
			for _, part := range parts {
				if !overlapSimpleCommand.MatchString(strings.TrimSpace(part)) {
					simple = false
					break
				}
			}
			if simple {
				setup = slices.DeleteFunc(setup, func(s string) bool { return s == prep })
				break
			}
		}
	}
	// A node test invocation listing literal tracked files has exactly those inputs.
	paths := func(command string) []string {
		_, body := script(command)
		fields := strings.Fields(body)
		if len(fields) < 3 || fields[0] != "node" || fields[1] != "--test" {
			return nil
		}
		for _, p := range fields[2:] {
			if !overlapTestPath.MatchString(p) || !slices.Contains(tracked, p) {
				return nil
			}
		}
		return fields[2:]
	}
	coverage := make([][]string, len(checks))
	for i, c := range checks {
		coverage[i] = paths(c.Run)
	}
	// Strict supersets win regardless of ordering; equal sets keep the earlier command.
	keep := make([]project.Check, 0, len(checks))
	for i, c := range checks {
		covered := false
		if len(coverage[i]) > 0 {
			for j, other := range coverage {
				if i == j || len(other) == 0 {
					continue
				}
				subset := true
				for _, p := range coverage[i] {
					if !slices.Contains(other, p) {
						subset = false
						break
					}
				}
				if !subset {
					continue
				}
				reverse := true
				for _, p := range other {
					if !slices.Contains(coverage[i], p) {
						reverse = false
						break
					}
				}
				if !reverse || j < i {
					covered = true
					break
				}
			}
		}
		if !covered {
			keep = append(keep, c)
		}
	}
	return setup, keep
}

var overlapSimpleCommand = regexp.MustCompile(`^[A-Za-z0-9_./-]+(?:[ \t]+[A-Za-z0-9_./-]+)*$`)
var overlapTestPath = regexp.MustCompile(`^[A-Za-z0-9_./-]+\.(?:js|cjs|mjs)$`)
