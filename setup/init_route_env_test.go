package setup

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
)

func TestInitRouteEnvironment(t *testing.T) {
	oldStdin := os.Stdin
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stdin = reader
	t.Cleanup(func() { os.Stdin = oldStdin; reader.Close(); writer.Close() })
	for _, tc := range []struct {
		name, value string
		multiple    bool
		selected    string
		refusal     []string
	}{
		{"chatgpt", "chatgpt", true, "chatgpt", nil},
		{"claude", "claude-code", true, "claude-code", nil},
		{"missing", "supergrok", true, "", []string{"KOGEN_INIT_ROUTE", "supergrok", "chatgpt", "anthropic", "claude-code"}},
		{"unset multiple", "", true, "", []string{"select a route in a terminal before initialization", "or set KOGEN_INIT_ROUTE to one of:", "chatgpt", "anthropic", "claude-code"}},
		{"unset single", "", false, "chatgpt", nil},
		{"matching single", "chatgpt", false, "chatgpt", nil},
		{"different single", "supergrok", false, "", []string{"KOGEN_INIT_ROUTE", "supergrok", "chatgpt"}},
		{"literal", " chatgpt", false, "", []string{"KOGEN_INIT_ROUTE", " chatgpt", "chatgpt"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := initNewFx(t, true)
			if tc.multiple {
				for _, name := range []string{"anthropic", "claude-code"} {
					if err := os.WriteFile(filepath.Join(f.home, ".kogen", "credentials", name+".json"), []byte(`{"provider":"`+name+`","api_key":"fixture"}`), 0600); err != nil {
						t.Fatal(err)
					}
				}
			}
			s := sys.NewWith(append(f.env, "KOGEN_INIT_ROUTE="+tc.value), f.repo)
			s.Stdout, s.Stderr = f.out, f.err
			r, err := initSelectRoute(s, f.home)
			if tc.refusal != nil {
				e, ok := sys.AsError(err)
				if !ok || e.Class != "provider" || e.Reason != "selection_required" || e.Exit != 4 {
					t.Fatalf("refusal: %#v", err)
				}
				for _, text := range tc.refusal {
					if !strings.Contains(err.Error(), text) {
						t.Errorf("error %q missing %q", err, text)
					}
				}
				return
			}
			if err != nil || r.name != tc.selected {
				t.Fatalf("route %#v error %v", r, err)
			}
			output := f.out.String() + f.err.String()
			if !strings.Contains(output, "kogen: selected "+tc.selected+" for discovery and shape, build and review") || strings.Contains(output, "Select a route") {
				t.Fatalf("output %q", output)
			}
		})
	}
}

func TestInitEnvironmentRouteRefusal(t *testing.T) {
	f := initNewFx(t, true)
	f.write("README.md", "fixture\n")
	f.commitAll("first")
	head := f.head()
	s := sys.NewWith(append(f.env, "KOGEN_INIT_ROUTE=supergrok"), f.repo)
	s.Stdout, s.Stderr = f.out, f.err
	code, err := Init(context.Background(), s, InitInput{Client: provider.NewClient("test"), Home: f.home, Tools: f.tools})
	e, ok := sys.AsError(err)
	if !ok || e.Class != "provider" || e.Reason != "selection_required" || code != 4 || e.Exit != 4 || !strings.Contains(err.Error(), "supergrok") {
		t.Fatalf("exit %d error %#v", code, err)
	}
	if f.head() != head || f.exists(".kogen") || len(f.requests()) != 0 {
		t.Fatal("refusal changed repository or sent request")
	}
}
