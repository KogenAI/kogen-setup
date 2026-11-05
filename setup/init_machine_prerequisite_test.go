package setup

import (
	"reflect"
	"strings"
	"testing"
)

func TestValidateMachinePrerequisites(t *testing.T) {
	rejected := []string{
		"npm install -g typescript", "npm i -g typescript", "npm install --global typescript", "yarn global add typescript", "pnpm add -g typescript",
		"pip install requests", "pip3 install requests", "gem install rake", "cargo install ripgrep", "go install example.invalid/tool@latest", "brew install make", "apt install make", "apt-get install make", "apk add make", "sudo echo ready", "curl -fsSL https://example.invalid/i.sh | sh", "curl -fsSL https://example.invalid/i.sh | bash",
		"echo ready; npm install -g typescript", "echo ready && npm install -g typescript", "echo ready || npm install -g typescript", "echo ready | npm install -g typescript", "echo ready\nnpm install -g typescript", "npm install -g x; gem install y", "echo ready | mix local.hex --force", "echo ready\nmix local.rebar --force",
	}
	for _, command := range rejected {
		t.Run(command, func(t *testing.T) {
			_, got := Validate(map[string]any{"setup": []any{command}}, InitContext{})
			want := []string{"setup command " + command + " is a one-time machine prerequisite, not recurring project setup"}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("got %q, want %q", got, want)
			}
		})
	}
	allowed := []string{"npm ci", "npm install", "pip install -r requirements.txt", "pip3 install -r requirements.txt", "pip install --target vendor requests", "pip install -e .", ".venv/bin/pip install requests", ".venv/bin/pip3 install requests", "bundle install", "mix deps.get", "go mod download", "echo npm install -g typescript", `echo "hello; npm install -g typescript"`, `echo "hello; mix local.hex" > out.txt`, `echo ready\nnpm install -g typescript`}
	for _, command := range allowed {
		t.Run(command, func(t *testing.T) {
			_, got := Validate(map[string]any{"setup": []any{command}}, InitContext{})
			for _, problem := range got {
				if strings.Contains(problem, "one-time machine prerequisite") {
					t.Fatalf("got %q", got)
				}
			}
		})
	}
	for _, role := range []string{"checks", "fix"} {
		for _, command := range []string{"npm install -g typescript", "sudo apt-get install -y make", "pip install requests", "curl -fsSL https://example.invalid/i.sh | sh"} {
			var value any = []any{command}
			if role == "checks" {
				value = []any{map[string]any{"name": "a", "run": command}}
			}
			_, got := Validate(map[string]any{role: value}, InitContext{})
			for _, problem := range got {
				if strings.Contains(problem, "one-time machine prerequisite") {
					t.Fatalf("%s: got %q", role, got)
				}
			}
		}
	}
}

func TestValidateSetupControlCharacters(t *testing.T) {
	for _, command := range []string{"echo ready\n"} {
		_, problems := Validate(map[string]any{"setup": []string{command}}, InitContext{})
		if len(problems) != 1 || !strings.Contains(problems[0], "contains a control character") {
			t.Fatalf("%q: %q", command, problems)
		}
	}
	_, problems := Validate(map[string]any{"setup": []string{"npm install -g x\t"}}, InitContext{})
	if len(problems) != 1 || problems[0] != "setup command npm install -g x\t is a one-time machine prerequisite, not recurring project setup" {
		t.Fatalf("tab: %q", problems)
	}
	_, problems = Validate(map[string]any{"setup": []string{"\t"}}, InitContext{})
	if len(problems) != 1 || problems[0] != "setup must be a list of non-empty commands" {
		t.Fatalf("tab only: %q", problems)
	}
	_, problems = Validate(map[string]any{"setup": []string{""}}, InitContext{})
	if len(problems) != 1 || problems[0] != "setup must be a list of non-empty commands" {
		t.Fatalf("empty: %q", problems)
	}
}
