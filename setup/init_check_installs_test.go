package setup

import (
	"fmt"
	"reflect"
	"testing"
)

func TestValidateCheckInstallsDependencies(t *testing.T) {
	for _, command := range []string{
		"npm ci && npm test", "mix deps.get; mix test", "pip install -r requirements.txt && pytest", "bundle install && rspec",
		"npm install", "npm i", "yarn install", "yarn", "pnpm install", "pip3 install", "python -m pip install", "go mod download", "cargo fetch", "composer install", "poetry install", "uv sync",
		"npm test && npm ci", "npm test || npm ci", "npm ci | cat", "npm ci; npm install", "  yarn install --immutable",
	} {
		t.Run(command, func(t *testing.T) {
			_, got := Validate(map[string]any{"checks": initCheckList("suite", command)}, InitContext{})
			want := []string{fmt.Sprintf("check suite (%s) installs dependencies; put the install in setup", command)}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("got %q, want %q", got, want)
			}
		})
	}
	for _, command := range []string{"go mod verify && go test ./...", "npm ls", "pip check", "mix deps", "echo npm ci", "printf 'npm ci'", "my-npm install", "npm install-extra", "yarn test", "cat file | npm ci"} {
		t.Run(command, func(t *testing.T) {
			_, got := Validate(map[string]any{"checks": initCheckList("suite", command)}, InitContext{})
			if len(got) != 0 {
				t.Fatalf("got %q", got)
			}
		})
	}
	command := "npm test\nnpm ci"
	_, got := Validate(map[string]any{"checks": initCheckList("suite", command)}, InitContext{})
	want := []string{fmt.Sprintf("check suite command %q contains a control character; put one command per entry", command), fmt.Sprintf("check suite (%s) installs dependencies; put the install in setup", command)}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %q, want %q", got, want)
	}
	_, got = Validate(map[string]any{"setup": []any{"npm ci"}, "fix": []any{"npm ci"}, "checks": initCheckList("suite", "npm test")}, InitContext{})
	if len(got) != 0 {
		t.Fatalf("got %q", got)
	}
}
