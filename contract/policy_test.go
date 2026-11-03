package contract

import (
	"strings"
	"testing"

	"github.com/KogenAI/kogen-setup/setup"
)

// init-policy: the setup conversation's model-facing policy, which kogen-setup owns since it moved
// from kogen-executor's agent package (the pins executor's contract held for agent.Init and
// agent.SubmitConfigurationTool): the instructions are the init prompt, and the submit tool's name
// and its one definition. kogen's tests that list every tool definition read them.
func TestInitPolicyIsThePromptAndItsSubmitTool(t *testing.T) {
	instructions := setup.InitInstructions()
	if !strings.HasPrefix(instructions, "You configure Kogen for an existing software project.") || !strings.HasSuffix(instructions, "\n") {
		t.Fatalf("setup.InitInstructions() is not the init prompt: %q", instructions)
	}
	equal(t, "setup.SubmitConfigurationTool", setup.SubmitConfigurationTool, "submit_configuration")
	defs := setup.InitToolDefinitions(setup.SubmitConfigurationTool)
	equal(t, "setup.InitToolDefinitions(submit_configuration) count", len(defs), 1)
	equal(t, "setup.InitToolDefinitions(submit_configuration) name", defs[0]["name"], any("submit_configuration"))
	equal(t, "setup.InitToolDefinitions(submit_configuration) type", defs[0]["type"], any("function"))
	func() {
		defer func() {
			if recover() == nil {
				t.Error("setup.InitToolDefinitions accepted an unknown tool name")
			}
		}()
		setup.InitToolDefinitions("nope")
	}()
}
