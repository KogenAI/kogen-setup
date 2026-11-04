package setup

import (
	"embed"
	"fmt"

	"github.com/KogenAI/kogen-loop/tools"
)

// The setup conversation's model-facing policy: the init prompt (prompts/init.md) and its one
// tool, submit_configuration. Every byte is the one the models have always been given (it moved
// here from kogen-executor's agent package unchanged); testdata/prompts_golden.json and
// testdata/defs_golden.json record them.

// SubmitConfigurationTool is the setup conversation's submission tool.
const SubmitConfigurationTool = "submit_configuration"

//go:embed prompts/*.md
var promptFiles embed.FS

// InitInstructions is the setup conversation's instructions, byte for byte what the model
// receives (including the final newline).
func InitInstructions() string {
	b, err := promptFiles.ReadFile("prompts/init.md")
	if err != nil {
		panic(err)
	}
	return string(b)
}

// InitToolDefinitions returns the model-facing definition of each named tool, in order: a
// generic tool comes from kogen-loop/tools, submit_configuration is the setup conversation's. A
// name that is neither panics: the names are fixed by the program.
func InitToolDefinitions(names ...string) []map[string]any {
	out := make([]map[string]any, len(names))
	for i, name := range names {
		out[i] = initToolDefinition(name)
	}
	return out
}

func initToolDefinition(name string) map[string]any {
	if d, ok := tools.Definition(name); ok {
		return d
	}
	if name == SubmitConfigurationTool {
		return submitConfigurationDef()
	}
	panic(fmt.Sprintf("setup: unknown tool %q", name))
}

func str() map[string]any { return map[string]any{"type": "string"} }
func strList() map[string]any {
	return map[string]any{"type": "array", "items": str()}
}

func submitConfigurationDef() map[string]any {
	return map[string]any{
		"type":        "function",
		"name":        SubmitConfigurationTool,
		"strict":      false,
		"description": "The project's setup commands, fixers, checks and protected verification configuration; dependency-only manifests and lockfiles are ineligible.",
		"parameters": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"setup": strList(),
				"fix":   strList(),
				"checks": map[string]any{
					"type": "array",
					"items": map[string]any{
						"type":       "object",
						"properties": map[string]any{"name": str(), "run": str()},
						"required":   []any{"name", "run"},
					},
				},
				"protect": strList(),
			},
			"required": []any{"setup", "fix", "checks", "protect"},
		},
	}
}
