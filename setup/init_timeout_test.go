package setup

import (
	"testing"
	"time"

	"github.com/KogenAI/kogen-loop/sys"
)

func TestInitTimeoutWithSuccessfulTermHandler(t *testing.T) {
	s := sys.New()
	r, err := s.Run("trap 'exit 0' TERM; while :; do :; done", t.TempDir(), sys.Options{Timeout: 300 * time.Millisecond, KillGroupOnExit: true})
	if err != nil {
		t.Fatal(err)
	}
	if !r.TimedOut || r.Status != 0 {
		t.Fatalf("result: %+v", r)
	}
	if got := initCommandFailure("check", "command", r); got != "check (command) timed out after 10m" {
		t.Fatalf("failure: %q", got)
	}
}
