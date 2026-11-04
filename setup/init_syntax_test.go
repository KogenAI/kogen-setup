package setup

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateShellSyntax(t *testing.T) {
	for _, kind := range []string{"setup", "fix", "check"} {
		for _, command := range []string{`echo "unterminated`, `go test ./... &&`, `if true; then echo x`, `echo $(date`, `go test ./... |`} {
			t.Run(kind+"/"+command, func(t *testing.T) {
				cmd := exec.Command("sh", "-n", "-c", command)
				cmd.Env = []string{}
				output, err := cmd.CombinedOutput()
				if err == nil {
					t.Fatal("fixture parsed")
				}
				line, _, _ := strings.Cut(string(output), "\n")
				args := map[string]any{kind: []any{command}}
				if kind == "check" {
					args = map[string]any{"checks": initCheckList("syntax", command)}
				}
				_, problems := Validate(args, InitContext{})
				want := kind + " command " + command + " is not valid shell syntax: " + line
				if !containsSyntaxProblem(problems, want) {
					t.Fatalf("problems %q, want %q", problems, want)
				}
			})
		}
	}
	for _, kind := range []string{"setup", "fix", "check"} {
		for _, command := range []string{"nonexistent-program --flag", "cat nonexistent-file", "touch " + filepath.Join(t.TempDir(), "marker")} {
			args := map[string]any{kind: []any{command}}
			if kind == "check" {
				args = map[string]any{"checks": initCheckList("syntax", command)}
			}
			_, problems := Validate(args, InitContext{})
			if len(problems) != 0 {
				t.Fatalf("%s %s: %q", kind, command, problems)
			}
			if strings.HasPrefix(command, "touch ") {
				if _, err := os.Stat(strings.TrimPrefix(command, "touch ")); !os.IsNotExist(err) {
					t.Fatalf("marker exists: %v", err)
				}
			}
		}
	}
	_, problems := Validate(map[string]any{"fix": []any{`TOKEN=secretvalue echo "`}}, InitContext{})
	if len(problems) == 0 || strings.Contains(strings.Join(problems, " "), "secretvalue") {
		t.Fatalf("credential disclosure: %q", problems)
	}
}

func containsSyntaxProblem(problems []string, want string) bool {
	for _, p := range problems {
		if p == want {
			return true
		}
	}
	return false
}

func TestSyntaxRecordingShell(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "shell.go")
	program := `package main
import ("encoding/json"; "fmt"; "os")
func main() { cwd,_:=os.Getwd(); b,_:=json.Marshal(map[string]any{"args":os.Args[1:],"env":os.Environ(),"cwd":cwd}); fmt.Fprintln(os.Stderr,string(b)); fmt.Fprintln(os.Stderr,"second line"); os.Exit(2) }`
	if err := os.WriteFile(source, []byte(program), 0600); err != nil {
		t.Fatal(err)
	}
	if out, err := exec.Command("go", "build", "-o", filepath.Join(dir, "sh"), source).CombinedOutput(); err != nil {
		t.Fatalf("build shell: %v %s", err, out)
	}
	t.Setenv("PATH", dir)
	t.Setenv("SYNTAX_SENTINEL", "secret")
	command := "nonexistent-program --flag"
	_, problems := Validate(map[string]any{"checks": initCheckList("syntax", command)}, InitContext{Root: filepath.Join(dir, "project")})
	prefix := "check command " + command + " is not valid shell syntax: "
	if len(problems) != 1 || !strings.HasPrefix(problems[0], prefix) {
		t.Fatalf("problems: %q", problems)
	}
	var got struct {
		Args []string `json:"args"`
		Env  []string `json:"env"`
		Cwd  string   `json:"cwd"`
	}
	if err := json.Unmarshal([]byte(strings.TrimPrefix(problems[0], prefix)), &got); err != nil {
		t.Fatal(err)
	}
	cwd, _ := os.Getwd()
	if strings.Join(got.Args, "\x00") != strings.Join([]string{"-n", "-c", command}, "\x00") || len(got.Env) != 0 || got.Cwd != cwd {
		t.Fatalf("recording: %+v", got)
	}
	t.Setenv("PATH", filepath.Join(dir, "missing"))
	_, problems = Validate(map[string]any{"fix": []any{`echo "`}}, InitContext{})
	for _, p := range problems {
		if strings.Contains(p, "is not valid shell syntax") {
			t.Fatalf("missing sh: %q", problems)
		}
	}
}

func TestInitCorrectsShellSyntax(t *testing.T) {
	bad := `touch marker; echo "x`
	f := initNewFx(t, true, initSubmit(map[string]any{"fix": []any{bad}}), initSubmit(map[string]any{"fix": []any{"gofmt -w ."}}))
	f.write("README.md", "notes\n")
	f.commitAll("notes")
	exit, _, _, err := f.run("")
	if err != nil || exit != 0 {
		t.Fatalf("exit %d: %v", exit, err)
	}
	requests := f.requests()
	if len(requests) != 2 {
		t.Fatalf("requests: %d", len(requests))
	}
	body, _ := json.Marshal(requests[1])
	if !strings.Contains(string(body), "is not valid shell syntax") {
		t.Fatalf("correction: %s", body)
	}
	if f.exists("marker") {
		t.Fatal("malformed command executed")
	}
	cfg := f.config()
	if len(cfg.Fix) != 1 || cfg.Fix[0] != "gofmt -w ." {
		t.Fatalf("config: %+v", cfg)
	}
}

func TestSyntaxWithOtherInvalidEntries(t *testing.T) {
	bad := `echo "unterminated`
	for _, args := range []map[string]any{
		{"setup": []any{bad, 42}},
		{"fix": []any{42, bad}},
		{"checks": []any{map[string]any{"name": "acceptance", "run": bad}}},
		{"checks": []map[string]any{{"name": "valid", "run": "npm ci"}, {"name": "valid", "run": bad}}},
	} {
		_, problems := Validate(args, InitContext{})
		if len(problems) < 2 || !strings.Contains(strings.Join(problems, "\n"), bad+" is not valid shell syntax:") {
			t.Fatalf("%v: %q", args, problems)
		}
	}
}
