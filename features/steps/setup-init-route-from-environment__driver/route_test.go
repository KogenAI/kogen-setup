//go:build routeacceptance

package setup

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
)

func TestEnvironmentRouteAcceptance(t *testing.T) {
	if os.Getenv("ROUTE_ACCEPTANCE") != "1" {
		return
	}
	f := initNewFx(t, true)
	f.write("README.md", "fixture\n")
	f.commitAll("fixture")
	names := strings.Split(os.Getenv("ROUTE_AVAILABLE"), ",")
	dir := filepath.Join(f.home, ".kogen", "credentials")
	if !strings.Contains(","+os.Getenv("ROUTE_AVAILABLE")+",", ",chatgpt,") {
		os.Remove(filepath.Join(dir, "chatgpt.json"))
	}
	for _, name := range names {
		if name != "chatgpt" {
			if err := os.WriteFile(filepath.Join(dir, name+".json"), []byte(fmt.Sprintf(`{"provider":%q,"api_key":"fixture"}`, name)), 0600); err != nil {
				t.Fatal(err)
			}
		}
	}
	s := sys.NewWith(append(f.env, "KOGEN_INIT_ROUTE="+os.Getenv("KOGEN_INIT_ROUTE")), f.repo)
	s.Stdout, s.Stderr = f.out, f.err
	var err error
	selected := ""
	code := 0
	if os.Getenv("ROUTE_ENTRY") == "init" {
		code, err = Init(context.Background(), s, InitInput{Client: provider.NewClient("test"), Home: f.home, Tools: f.tools})
	} else {
		var r initRoute
		r, err = initSelectRoute(s, f.home)
		selected = r.name
	}
	detail := ""
	if err != nil {
		detail = err.Error()
		if e, ok := sys.AsError(err); ok {
			code = e.Exit
		}
	}
	b, _ := json.Marshal(map[string]any{"selected": selected, "exit": code, "error": detail, "output": f.out.String() + f.err.String()})
	fmt.Println("ROUTE_RESULT=" + string(b))
}
