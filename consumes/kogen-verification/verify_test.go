package consumes_test

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-verification/verify"
	"kogen-loop/sys"
)

func TestCopyAndRunner(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "root")
	clone := filepath.Join(base, "copy")
	home := filepath.Join(base, "home")
	for _, p := range []string{root, clone, home, filepath.Join(root, ".git"), filepath.Join(root, ".kogen", "local")} {
		if err := os.MkdirAll(p, 0700); err != nil {
			t.Fatal(err)
		}
	}
	for p, v := range map[string]string{"file": "contents", ".git/secret": "git", ".kogen/project.yaml": "config", ".kogen/local/secret": "local"} {
		if err := os.WriteFile(filepath.Join(root, p), []byte(v), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := verify.CopyTree(root, clone); err != nil {
		t.Fatal(err)
	}
	for p, v := range map[string]string{"file": "contents", ".kogen/project.yaml": "config"} {
		b, err := os.ReadFile(filepath.Join(clone, p))
		if err != nil || string(b) != v {
			t.Fatalf("copy %s: %q %v", p, b, err)
		}
	}
	for _, p := range []string{".git", ".kogen/local"} {
		if _, err := os.Stat(filepath.Join(clone, p)); !os.IsNotExist(err) {
			t.Fatalf("copied %s: %v", p, err)
		}
	}
	s := sys.NewWith([]string{"HOME=" + home, "PATH=" + os.Getenv("PATH"), "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=" + filepath.Join(home, "gitconfig")}, clone)
	s.Stdout = io.Discard
	s.Stderr = io.Discard
	tool := verify.Tools{Node: "fake-node", Quint: "fake-quint", Cucumber: "fake-cucumber"}
	command := `test "$KOGEN_NODE" = fake-node && test "$KOGEN_QUINT" = fake-quint && test "$KOGEN_CUCUMBER" = fake-cucumber && test -f "$KOGEN_ACCEPTANCE_FEATURES" && printf '{}' > "$KOGEN_ACCEPTANCE_REPORT" && echo checked`
	reason, out, err := verify.RunnerCheck(context.Background(), s, tool, clone, command)
	if err != nil || reason != "" || !strings.Contains(out, "checked") {
		t.Fatalf("runner: %q %q %v", reason, out, err)
	}
	reason, out, err = verify.RunnerCheck(context.Background(), s, tool, clone, "echo failed; exit 7")
	if err != nil || !strings.Contains(reason, "status 7") || !strings.Contains(out, "failed") {
		t.Fatalf("failed runner: %q %q %v", reason, out, err)
	}
	reason, _, err = verify.RunnerCheck(context.Background(), s, tool, clone, "true")
	if err != nil || !strings.Contains(reason, "no report") {
		t.Fatalf("missing report: %q %v", reason, err)
	}
}
