package main

import (
	"encoding/json"
	"os"

	"github.com/KogenAI/kogen-setup/setup"
)

func main() {
	var args map[string]any
	if err := json.NewDecoder(os.Stdin).Decode(&args); err != nil {
		panic(err)
	}
	_, problems := setup.Validate(args, setup.InitContext{})
	if problems == nil {
		problems = []string{}
	}
	if err := json.NewEncoder(os.Stdout).Encode(problems); err != nil {
		panic(err)
	}
}
