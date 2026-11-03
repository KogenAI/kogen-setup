package setup

import (
	"kogen-loop/provider"
	"kogen-loop/tools"
)

// Copied from kogen-shaping shape/conversation.go: the three conversation helpers Init uses.

// A conversation's prompt-cache identity (provider.NewCacheID: at most 64 characters, no
// clock time, request id or counter) is created once when the conversation starts, recorded in
// the conversation's evidence as a `cache_identity` event, and passed on every request of that
// conversation: retries, transient-stream retries and working-window resets included. The
// shaper, each shape worker, a refinement and the setup conversation never share one. Shape
// and Refine have no resume of their own, so an identity lives as long as one invocation.
func newCacheID() string { return provider.NewCacheID() }

// conversationRequest completes a request of the conversation that holds cacheID: the one
// place where a conversation's requests get their identity.
func conversationRequest(req provider.Request, cacheID string) provider.Request {
	req.CacheID = cacheID
	return req
}

// toolOutput is the delivered result of one tool call (Shape.output): bounded text, or
// unchanged typed content. Text is cut once, here, and replayed as stored.
func toolOutput(c tools.Call, result any) map[string]any {
	switch v := result.(type) {
	case tools.Output:
		return c.Output(v.Cut())
	case string:
		return c.Output(tools.Cut(v))
	}
	return c.Output(result)
}
