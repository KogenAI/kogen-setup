package setup

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestInitValidateLongRunning(t *testing.T) {
	for _, command := range []string{"jest --watchAll", "npx jest --watch", "vitest -w", "mocha --watch", "tsc --watch", "mix test --watch", "mix test.watch", "mix phx.server", "npm start", "npm run dev", "npm run serve", "yarn start", "yarn dev", "pnpm dev", "rails server", "rails s", "flask run", "python -m http.server", "docker compose up", "docker-compose up", "tail -f log.txt", "sleep 61", "sleep 2m", "sleep 1h", "sleep 1d", "echo ok; npm start", "echo ok && npm start", "false || npm start", "npm start | cat"} {
		t.Run(command, func(t *testing.T) {
			_, problems := Validate(map[string]any{"checks": initCheckList("a", command)}, InitContext{})
			want := "check a (" + command + ") does not exit on its own (watch or server mode); use a command that runs once"
			if !slicesContain(problems, want) {
				t.Fatalf("problems: %q", problems)
			}
		})
	}
	for _, command := range []string{"npx vitest run", "npm run build", "docker compose up -d", "docker-compose up --detach", "sleep 59", "sleep 60", "sleep 1m", "jest --watchman", "echo npm run dev", "echo jest --watch", "cat | npm start", "prettier --watch ."} {
		t.Run(command, func(t *testing.T) {
			_, problems := Validate(map[string]any{"checks": initCheckList("a", command)}, InitContext{})
			for _, p := range problems {
				if strings.Contains(p, "does not exit on its own") {
					t.Fatalf("problems: %q", problems)
				}
			}
		})
	}
	for _, command := range []string{"tsc --watch", "npx jest --watch", "npm run dev", "mix phx.server", "echo ok && npm start", "sleep 2m"} {
		t.Run("fix "+command, func(t *testing.T) {
			_, problems := Validate(map[string]any{"fix": []any{command, "prettier --write ."}}, InitContext{})
			want := []string{"fix command " + command + " does not exit on its own (watch or server mode); use a command that runs once"}
			if command == "npx jest --watch" {
				want = append([]string{"fix command " + command + " runs tests or linting; put it in checks"}, want...)
			}
			if !reflect.DeepEqual(problems, want) {
				t.Fatalf("problems: %q", problems)
			}
		})
	}
	_, problems := Validate(map[string]any{"fix": []any{"prettier --write .", "prettier --watch ."}, "setup": []any{"prettier --watch ."}}, InitContext{})
	if len(problems) != 0 {
		t.Fatalf("problems: %q", problems)
	}
	_, problems = Validate(map[string]any{"setup": []any{"npm run dev", "npm ci", "docker compose up -d"}, "fix": []any{"npm run dev"}}, InitContext{})
	want := []string{
		"setup command npm run dev does not exit on its own (watch or server mode); use a command that runs once",
		"fix command npm run dev does not exit on its own (watch or server mode); use a command that runs once",
	}
	if !reflect.DeepEqual(problems, want) {
		t.Fatalf("problems: %q", problems)
	}
}

func slicesContain(list []string, value string) bool {
	for _, s := range list {
		if s == value {
			return true
		}
	}
	return false
}

func TestInitCorrectsLongRunningBeforeVerification(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "ran")
	command := "npm run dev; touch " + marker
	f := initNewFx(t, true, initSubmit(map[string]any{"checks": initCheckList("a", command)}), initNothing())
	f.write("README.md", "notes\n")
	f.commitAll("notes")
	exit, _, _, err := f.run("")
	if err != nil || exit != 0 {
		t.Fatalf("exit %d, error %v", exit, err)
	}
	requests := f.requests()
	if len(requests) != 2 {
		t.Fatalf("requests: %d", len(requests))
	}
	body, _ := json.Marshal(requests[1])
	if !strings.Contains(string(body), "check a ("+command+") does not exit on its own") {
		t.Fatalf("correction: %s", body)
	}
	if checks := f.config().Checks; len(checks) != 0 {
		t.Fatalf("checks: %v", checks)
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatalf("marker stat: %v", err)
	}
}

func TestInitCorrectsLongRunningFixBeforeVerification(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "ran")
	watch := "tsc --watch; touch " + marker
	checks := initCheckList("readme", "grep -qx '# notes' README.md")
	f := initNewFx(t, true,
		initSubmit(map[string]any{"fix": []any{watch}, "checks": checks}),
		initSubmit(map[string]any{"fix": []any{"prettier --write ."}, "checks": checks}))
	f.write("README.md", "# notes\n")
	f.commitAll("notes")
	f.program("prettier", "exit 0")
	exit, _, _, err := f.run("")
	if err != nil || exit != 0 {
		t.Fatalf("exit %d, error %v", exit, err)
	}
	requests := f.requests()
	if len(requests) != 2 {
		t.Fatalf("requests: %d", len(requests))
	}
	body, _ := json.Marshal(requests[1])
	if !strings.Contains(string(body), "fix command "+watch+" does not exit on its own") {
		t.Fatalf("correction: %s", body)
	}
	if fix := f.config().Fix; !reflect.DeepEqual(fix, []string{"prettier --write ."}) {
		t.Fatalf("fix: %v", fix)
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatalf("marker stat: %v", err)
	}
}
