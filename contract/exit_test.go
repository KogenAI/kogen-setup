package contract

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-loop/sys"
)

// exit-success: 0 and no error for the three outcomes that succeed: the first commit of an
// empty repository, a configured project, and a project already initialized.
func TestInitSucceedsWithExitZero(t *testing.T) {
	t.Run("empty repository", func(t *testing.T) {
		f := newInitFx(t, false)
		f.mustRun()
	})
	t.Run("configured", func(t *testing.T) {
		f := newInitFx(t, true, nothing())
		f.write("README.md", "x\n")
		f.commitAll("first")
		f.mustRun()
	})
	t.Run("already initialized", func(t *testing.T) {
		f := newInitFx(t, true, nothing())
		f.write("README.md", "x\n")
		f.commitAll("first")
		f.mustRun()
		head := f.head()
		out, errs := f.mustRun()
		wantLines(t, out, "Kogen is already initialized in "+f.repo, "Next: add the project's checks to commands.checks in .kogen/project.yaml")
		equal(t, "stderr", errs, "")
		equal(t, "HEAD", f.head(), head)
		equal(t, "requests", len(f.requests()), 1)
	})
}

// exit-sys-error: a refusal is a *sys.Error, and Init's exit is that error's Exit. kogen prints
// it with Render and exits with it. Nothing is committed.
func TestInitRefusalsAreSysErrorsWithTheirExit(t *testing.T) {
	cases := []struct {
		name, class, reason string
		exit                int
		script              []reply
		arrange             func(f *initFx) string // returns the directory to run in ("" = the repository)
	}{
		{"not a Git repository", "environment", "not_a_git_repo", 3, nil, func(f *initFx) string {
			plain := filepath.Join(f.base, "plain")
			os.MkdirAll(plain, 0o755)
			return plain
		}},
		{"no Git identity", "environment", "git_identity_missing", 3, nil, func(f *initFx) string {
			f.git("config", "--unset", "user.name")
			return ""
		}},
		{"files not committed yet", "environment", "no_commits", 3, nil, func(f *initFx) string {
			f.write("app.txt", "x\n")
			return ""
		}},
		{"uncommitted .gitignore", "environment", "dirty_tree", 5, nil, func(f *initFx) string {
			f.write(".gitignore", "a\n")
			f.commitAll("first")
			f.write(".gitignore", "b\n")
			return ""
		}},
		{"invalid leftover configuration", "environment", "project_config_invalid", 3, nil, func(f *initFx) string {
			f.write("README.md", "x\n")
			f.commitAll("first")
			f.write(project.ConfigPath, "version: 2\n")
			return ""
		}},
		{"not signed in", "provider", "login", 4, nil, func(f *initFx) string {
			os.RemoveAll(filepath.Join(f.home, ".kogen"))
			f.write("README.md", "x\n")
			f.commitAll("first")
			return ""
		}},
		{"two answers without a valid call", "provider", "init_invalid", 4, []reply{text("hello"), text("again")}, func(f *initFx) string {
			f.write("README.md", "x\n")
			f.commitAll("first")
			return ""
		}},
		{"commit refused", "environment", "commit_failed", 3, []reply{nothing()}, func(f *initFx) string {
			f.write("README.md", "x\n")
			f.commitAll("first")
			f.hook("pre-commit", "exit 1")
			return ""
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := newInitFx(t, true, c.script...)
			dir := c.arrange(f)
			head := f.head()
			exit, out, _, err := f.run(dir)
			wantSysError(t, exit, err, c.class, c.reason, c.exit)
			equal(t, "HEAD", f.head(), head)
			if strings.Contains(out, "Commit: ") {
				t.Fatalf("stdout names a commit: %q", out)
			}
		})
	}
}

// exit-interrupt: an interrupt of the session is a *sys.Interrupted whose exit is the signal's
// code (SIGINT 130, SIGTERM 143, SIGHUP 129), also while the model request is in flight. Nothing
// is written.
func TestInitInterruptsExitWithTheSignalsCode(t *testing.T) {
	for signal, code := range map[string]int{"SIGINT": 130, "SIGTERM": 143, "SIGHUP": 129} {
		t.Run(signal, func(t *testing.T) {
			f := newInitFx(t, true, nothing())
			f.write("README.md", "x\n")
			f.commitAll("first")
			head := f.head()
			s, _, _ := f.session("")
			s.Interrupt(signal)
			exit, err := runSession(f, s)
			wantInterrupted(t, exit, err, code)
			equal(t, ".kogen written", f.exists(".kogen"), false)
			equal(t, "HEAD", f.head(), head)
		})
	}
	t.Run("during the model request", func(t *testing.T) {
		asked := make(chan struct{})
		f := newInitFx(t, true, func(w http.ResponseWriter, r *http.Request) {
			close(asked)
			<-r.Context().Done()
		})
		f.write("README.md", "x\n")
		f.commitAll("first")
		head := f.head()
		s, _, _ := f.session("")
		go func() {
			<-asked
			s.Interrupt("SIGTERM")
		}()
		exit, err := runSession(f, s)
		wantInterrupted(t, exit, err, 143)
		equal(t, ".kogen written", f.exists(".kogen"), false)
		equal(t, "HEAD", f.head(), head)
		equal(t, "status", f.status(), "")
	})
}

func wantInterrupted(t *testing.T, exit int, err error, code int) {
	t.Helper()
	var in *sys.Interrupted
	if !errors.As(err, &in) || in.ExitCode() != code || exit != code {
		t.Fatalf("exit %d, error %v (%T); want *sys.Interrupted, exit %d", exit, err, err, code)
	}
}

// exit-internal: any other failure is exit 70 with an error that is neither a *sys.Error nor a
// *sys.Interrupted; kogen prints it as controller/internal_error. Here the .gitignore Init must
// write is a directory.
func TestInitInternalFailureIsExit70(t *testing.T) {
	f := newInitFx(t, false)
	if err := os.Mkdir(filepath.Join(f.repo, ".gitignore"), 0o755); err != nil {
		t.Fatal(err)
	}
	exit, _, _, err := f.run("")
	equal(t, "exit", exit, 70)
	var in *sys.Interrupted
	if _, ok := sys.AsError(err); ok || err == nil || errors.As(err, &in) {
		t.Fatalf("error %v (%T), want an internal error", err, err)
	}
	equal(t, "HEAD", f.head(), "")
}
