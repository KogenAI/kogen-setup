package contract

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-executor/agent"
	"github.com/KogenAI/kogen-setup/setup"
)

// one-request: configuring a project sends exactly one request to the shaping model: the
// default shape model and effort, the init prompt as instructions and the submit_configuration
// tool as its only tool; the answer's submit_configuration call ends the conversation.
func TestInitAsksTheShapingModelOnceWithTheSubmitTool(t *testing.T) {
	f := newInitFx(t, true, nothing())
	f.write("README.md", "# notes\n")
	f.commitAll("notes")
	f.mustRun()
	req := f.requests()
	equal(t, "requests", len(req), 1)
	role := project.DefaultModels()["shape"]
	equal(t, "model", req[0]["model"], any(role.Model))
	reasoning, _ := req[0]["reasoning"].(map[string]any)
	equal(t, "effort", reasoning["effort"], any(role.Effort))
	equal(t, "instructions", req[0]["instructions"], any(setup.InitInstructions()))

	tools, _ := req[0]["tools"].([]any)
	equal(t, "tools", len(tools), 1)
	var defs []map[string]any
	raw, _ := json.Marshal(agent.AsAny(setup.InitToolDefinitions(setup.SubmitConfigurationTool)))
	if err := json.Unmarshal(raw, &defs); err != nil {
		t.Fatal(err)
	}
	got := tools[0].(map[string]any)
	equal(t, "tool", got["name"], any(setup.SubmitConfigurationTool))
	for _, k := range []string{"name", "description", "parameters"} {
		if !reflect.DeepEqual(got[k], defs[0][k]) {
			t.Fatalf("tool %s = %v, want %v", k, got[k], defs[0][k])
		}
	}
	equal(t, "submit tool name", setup.SubmitConfigurationTool, "submit_configuration")
}

// one-request, retried: an answer without the call is asked once more, with the reply that
// names the tool; the second answer's call ends the conversation.
func TestInitAsksOnceMoreWhenTheCallIsMissing(t *testing.T) {
	f := newInitFx(t, true, text("I think there are no checks."), nothing())
	f.write("README.md", "# notes\n")
	f.commitAll("notes")
	f.mustRun()
	req := f.requests()
	equal(t, "requests", len(req), 2)
	input, _ := req[1]["input"].([]any)
	last, _ := input[len(input)-1].(map[string]any)
	equal(t, "correction", last["content"], any("Answer by calling submit_configuration."))
}
