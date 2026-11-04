package consumes_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"kogen-loop/provider"
	"kogen-loop/sys"
	"kogen-loop/tools"
)

func TestRespondAndConversation(t *testing.T) {
	home := t.TempDir()
	dir := filepath.Join(home, ".kogen", "credentials")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "chatgpt.json"), []byte(`{"client_id":"oaiapp_fixture","access_token":"fixture","refresh_token":"fixture","expires_at":4102444800}`), 0600); err != nil {
		t.Fatal(err)
	}
	requests := make(chan map[string]any, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			return
		}
		requests <- body
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"type\":\"response.output_item.done\",\"output_index\":0,\"item\":{\"type\":\"function_call\",\"id\":\"fc_1\",\"call_id\":\"call_1\",\"name\":\"submit_configuration\",\"arguments\":\"{\\\"setup\\\":[]}\",\"status\":\"completed\"}}\n\n")
		fmt.Fprint(w, "data: {\"type\":\"response.completed\",\"response\":{\"usage\":{\"input_tokens\":100,\"input_tokens_details\":{\"cached_tokens\":10},\"output_tokens\":20,\"output_tokens_details\":{\"reasoning_tokens\":5}}}}\n\n")
	}))
	defer srv.Close()
	s := sys.NewWith([]string{"HOME=" + home, "KOGEN_PROVIDER_URL=" + srv.URL, "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=" + filepath.Join(home, "gitconfig")}, home)
	s.Stdout, s.Stderr = io.Discard, io.Discard
	input := []any{map[string]any{"role": "user", "content": "configure"}}
	defs := []any{map[string]any{"type": "function", "name": "submit_configuration", "parameters": map[string]any{"type": "object"}}}
	cache := provider.NewCacheID()
	resp, err := provider.NewClient("fixture").Respond(context.Background(), s, provider.Request{Role: provider.Role{Provider: "chatgpt", Model: "gpt-5.4", Effort: "high"}, Instructions: "instructions", Input: input, Tools: defs, CacheID: cache}, nil)
	if err != nil {
		t.Fatal(err)
	}
	body := <-requests
	if body["model"] != "gpt-5.4" || !reflect.DeepEqual(body["reasoning"], map[string]any{"effort": "high"}) {
		t.Fatalf("role settings: %#v", body)
	}
	if err := provider.RequireLogin(home, []provider.Role{{Provider: "chatgpt"}}); err != nil {
		t.Fatalf("synthetic login: %v", err)
	}
	if body["instructions"] != "instructions" || body["prompt_cache_key"] != cache || !reflect.DeepEqual(body["input"], input) || !reflect.DeepEqual(body["tools"], defs) {
		t.Fatalf("request: %#v", body)
	}
	calls := tools.Calls(resp.Items)
	if len(calls) != 1 || calls[0].Name != "submit_configuration" || !reflect.DeepEqual(calls[0].Args(), map[string]any{"setup": []any{}}) {
		t.Fatalf("items/calls: %#v %#v", resp.Items, calls)
	}
	if got := (provider.Usage{Input: 1, Cached: 2, Output: 3, Reasoning: 4}).Add(resp.Usage); got != (provider.Usage{Input: 101, Cached: 12, Output: 23, Reasoning: 9}) {
		t.Fatalf("usage: %+v", got)
	}
	replay := tools.Replay(resp.Items)
	if len(replay) != 1 || !reflect.DeepEqual(replay[0], resp.Items[0]) {
		t.Fatalf("replay: %#v", replay)
	}
	call := calls[0]
	if got := call.Output("invalid"); !reflect.DeepEqual(got, map[string]any{"type": "function_call_output", "call_id": "call_1", "output": "invalid"}) {
		t.Fatalf("output: %#v", got)
	}
	long := strings.Repeat("a", 20000)
	cut := tools.Cut(long)
	if len(cut) > 16384 || !strings.Contains(cut, "bytes omitted") {
		t.Fatalf("cut: length %d", len(cut))
	}
	if got := call.Output((tools.Output{Text: long}).Cut())["output"]; got != cut {
		t.Fatalf("text output: %v", got)
	}
	parts := []any{map[string]any{"type": "input_text", "text": "fixture"}}
	if got := call.Output((tools.Output{Parts: parts}).Cut())["output"]; !reflect.DeepEqual(got, parts) {
		t.Fatalf("typed output: %#v", got)
	}
}
