package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

const usageLine = "usage: kogen-setup <checkout>\n"

var commandPath string

func TestMain(m *testing.M) {
	os.Exit(run(m))
}

// run builds the real command once so every test runs it as a subprocess.
func run(m *testing.M) int {
	dir, err := os.MkdirTemp("", "kogen-setup-cmd-")
	if err != nil {
		os.Stderr.WriteString(err.Error() + "\n")
		return 1
	}
	defer os.RemoveAll(dir)
	commandPath = filepath.Join(dir, "kogen-setup")
	if out, err := exec.Command("go", "build", "-o", commandPath, ".").CombinedOutput(); err != nil {
		os.Stderr.WriteString("building the command: " + err.Error() + "\n" + string(out))
		return 1
	}
	return m.Run()
}

type output struct {
	exit   int
	stdout string
	stderr string
}

// runCommand runs the built command with separately captured streams. The home
// is a fresh empty directory, so no provider login is needed or reachable.
func runCommand(t *testing.T, ceiling string, args ...string) output {
	t.Helper()
	cmd := exec.Command(commandPath, args...)
	cmd.Env = append(os.Environ(), "HOME="+t.TempDir(), "GIT_CEILING_DIRECTORIES="+ceiling)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	exit := 0
	if err != nil {
		var ee *exec.ExitError
		if !errors.As(err, &ee) {
			t.Fatalf("running the command: %v", err)
		}
		exit = ee.ExitCode()
	}
	return output{exit: exit, stdout: stdout.String(), stderr: stderr.String()}
}

type report struct {
	Exit          *int `json:"exit"`
	Configuration *struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	} `json:"configuration"`
	Error *string `json:"error"`
	keys  map[string]json.RawMessage
}

// decodeOne requires stdout to be exactly one JSON object with the three
// documented fields and nothing else.
func decodeOne(t *testing.T, stdout string) report {
	t.Helper()
	dec := json.NewDecoder(strings.NewReader(stdout))
	var keys map[string]json.RawMessage
	if err := dec.Decode(&keys); err != nil || keys == nil {
		t.Fatalf("stdout is not a JSON object: %v\nstdout: %q", err, stdout)
	}
	if _, err := dec.Token(); err != io.EOF {
		t.Fatalf("stdout holds more than one JSON object or trailing text\nstdout: %q", stdout)
	}
	for _, name := range []string{"exit", "configuration", "error"} {
		if _, ok := keys[name]; !ok {
			t.Fatalf("JSON object lacks %q\nstdout: %q", name, stdout)
		}
	}
	if len(keys) != 3 {
		t.Fatalf("JSON object has unexpected fields\nstdout: %q", stdout)
	}
	var r report
	if err := json.Unmarshal([]byte(stdout), &r); err != nil {
		t.Fatalf("decoding stdout: %v\nstdout: %q", err, stdout)
	}
	if r.Exit == nil {
		t.Fatalf("JSON exit is not an integer\nstdout: %q", stdout)
	}
	r.keys = keys
	return r
}

func isNull(raw json.RawMessage) bool { return string(bytes.TrimSpace(raw)) == "null" }

func TestUsageWithoutExactlyOneCheckout(t *testing.T) {
	for name, args := range map[string][]string{
		"no argument":   nil,
		"two arguments": {t.TempDir(), t.TempDir()},
	} {
		t.Run(name, func(t *testing.T) {
			got := runCommand(t, t.TempDir(), args...)
			if got.exit != 2 {
				t.Errorf("exit = %d, want 2\nstderr: %q", got.exit, got.stderr)
			}
			if got.stderr != usageLine {
				t.Errorf("stderr = %q, want %q", got.stderr, usageLine)
			}
			if got.stdout != "" {
				t.Errorf("stdout = %q, want empty", got.stdout)
			}
		})
	}
}

func runGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
}

func TestEmptyGitRepositoryInitializes(t *testing.T) {
	parent := t.TempDir()
	repo := filepath.Join(parent, "repo")
	if err := os.Mkdir(repo, 0o755); err != nil {
		t.Fatal(err)
	}
	runGit(t, repo, "init", "-q")
	runGit(t, repo, "config", "user.name", "Test")
	runGit(t, repo, "config", "user.email", "test@example.com")

	got := runCommand(t, parent, repo)
	if got.exit != 0 {
		t.Fatalf("exit = %d, want 0\nstdout: %q\nstderr: %q", got.exit, got.stdout, got.stderr)
	}
	r := decodeOne(t, got.stdout)
	if *r.Exit != 0 {
		t.Errorf("JSON exit = %d, want 0", *r.Exit)
	}
	if !isNull(r.keys["error"]) {
		t.Errorf("JSON error = %s, want null", r.keys["error"])
	}
	if r.Configuration == nil {
		t.Fatalf("JSON configuration is null\nstdout: %q", got.stdout)
	}
	if r.Configuration.Path != ".kogen/project.yaml" {
		t.Errorf("configuration path = %q, want .kogen/project.yaml", r.Configuration.Path)
	}
	written, err := os.ReadFile(filepath.Join(repo, ".kogen", "project.yaml"))
	if err != nil {
		t.Fatalf("Init wrote no configuration: %v", err)
	}
	if r.Configuration.Content != string(written) {
		t.Errorf("configuration content differs from the written file\nJSON: %q\nfile: %q", r.Configuration.Content, written)
	}
	if strings.TrimSpace(got.stderr) == "" {
		t.Error("stderr is empty, want Init's human-readable output")
	}
}

func TestNotAGitRepositoryFails(t *testing.T) {
	parent := t.TempDir()
	dir := filepath.Join(parent, "plain")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatal(err)
	}

	got := runCommand(t, parent, dir)
	if got.exit == 0 {
		t.Fatalf("exit = 0, want nonzero\nstdout: %q\nstderr: %q", got.stdout, got.stderr)
	}
	r := decodeOne(t, got.stdout)
	if *r.Exit == 0 {
		t.Error("JSON exit = 0, want nonzero")
	}
	if *r.Exit != got.exit {
		t.Errorf("JSON exit = %d, process exit = %d, want equal", *r.Exit, got.exit)
	}
	if !isNull(r.keys["configuration"]) {
		t.Errorf("JSON configuration = %s, want null", r.keys["configuration"])
	}
	if r.Error == nil || *r.Error == "" {
		t.Fatalf("JSON error is null or empty, want the error string\nstdout: %q", got.stdout)
	}
	if !strings.Contains(got.stderr, *r.Error) {
		t.Errorf("stderr lacks the diagnostic %q\nstderr: %q", *r.Error, got.stderr)
	}
}
