package setup

import (
	"context"
	"net/http"
	"sync"
	"testing"
	"time"

	"kogen-loop/provider"
	"kogen-loop/sys"
)

// Copied from kogen-shaping shape/response_budget_test.go: the setup conversation of init with
// the production settings configures no response budget, so it sends under the pinned loop's 30
// minutes, observed on the real client's transport deadline. kogen's TestShapeBudgetRoleContract
// requires this subtest by name.

// deadlineObserver records the time the client's transport had left for each exchange.
type deadlineObserver struct {
	mu        sync.Mutex
	remaining []time.Duration
	missing   int
}

func (o *deadlineObserver) RoundTrip(r *http.Request) (*http.Response, error) {
	o.mu.Lock()
	if d, ok := r.Context().Deadline(); ok {
		o.remaining = append(o.remaining, time.Until(d))
	} else {
		o.missing++
	}
	o.mu.Unlock()
	return http.DefaultTransport.RoundTrip(r)
}

func observeDeadlines(c *provider.Client) *deadlineObserver {
	o := &deadlineObserver{}
	c.HTTP = &http.Client{Transport: o}
	return o
}

// shpEq is copied from kogen-shaping shape/helper_test.go.
func shpEq[T comparable](t *testing.T, what string, got, want T) {
	t.Helper()
	if got != want {
		t.Fatalf("%s = %v, want %v", what, got, want)
	}
}

func TestShapeBudgetRolesSetup(t *testing.T) {
	parallel(t)
	t.Run("the setup conversation of init sends under thirty minutes", func(t *testing.T) {
		parallel(t)
		f := initNewFx(t, true, initNothing())
		f.write("README.md", "x\n")
		f.commitAll("a")
		client := provider.NewClient("dev+12345678")
		obs := observeDeadlines(client)
		s := sys.NewWith(f.env, f.repo)
		s.Stdout, s.Stderr = f.out, f.err
		exit, err := Init(context.Background(), s, InitInput{Client: client, Tools: f.tools, Home: f.home})
		if exit != 0 || err != nil {
			t.Fatalf("exit %d err %v", exit, err)
		}
		shpEq(t, "requests", len(f.requests()), 1)
		shpEq(t, "client response budget", client.ResponseBudget, time.Duration(0))
		obs.mu.Lock()
		defer obs.mu.Unlock()
		if len(obs.remaining) != 1 || obs.missing != 0 || obs.remaining[0] > 30*time.Minute || obs.remaining[0] < 29*time.Minute {
			t.Fatalf("setup exchange deadlines %v (%d without one)", obs.remaining, obs.missing)
		}
	})
}
