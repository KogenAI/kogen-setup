package contract

import (
	"context"
	"reflect"
	"testing"

	"github.com/KogenAI/kogen-setup/setup"
	"github.com/KogenAI/kogen-verification/verify"
	"kogen-loop/provider"
	"kogen-loop/sys"
)

// init-signature: kogen cli/engine.go calls
// `setup.Init(s.Context(), s, setup.InitInput{Client: client, Tools: tools})` and uses the exit
// code only when err is nil.
var _ func(context.Context, *sys.Session, setup.InitInput) (int, error) = setup.Init

// init-input: the InitInput fields: Client and Tools, which kogen sets, and Home, which kogen
// leaves empty so that the session's HOME holds the login.
func TestInitInputFields(t *testing.T) {
	_ = setup.InitInput{Client: (*provider.Client)(nil), Tools: verify.Tools{}}
	typ := reflect.TypeOf(setup.InitInput{})
	want := []struct {
		name string
		typ  reflect.Type
	}{
		{"Client", reflect.TypeOf((*provider.Client)(nil))},
		{"Tools", reflect.TypeOf(verify.Tools{})},
		{"Home", reflect.TypeOf("")},
	}
	equal(t, "fields", typ.NumField(), len(want))
	for i, w := range want {
		f := typ.Field(i)
		if f.Name != w.name || f.Type != w.typ {
			t.Fatalf("field %d = %s %s, want %s %s", i, f.Name, f.Type, w.name, w.typ)
		}
	}
}

// home-from-session: with Home empty, Init reads the login under the session's HOME, not the
// process's (TestMain's HOME holds no login).
func TestInitReadsTheLoginUnderTheSessionsHome(t *testing.T) {
	f := newInitFx(t, true, nothing())
	f.write("README.md", "x\n")
	f.commitAll("first")
	f.mustRun()
	equal(t, "requests", len(f.requests()), 1)
}
