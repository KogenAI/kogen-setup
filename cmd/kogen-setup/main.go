// Command kogen-setup exposes the Init workflow to developers as JSON.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"unicode/utf8"

	"github.com/KogenAI/kogen-coordinator/git"
	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-executor/executor/claudecode"
	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
	"github.com/KogenAI/kogen-setup/setup"
	"github.com/KogenAI/kogen-verification/verify"
)

type configuration struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type result struct {
	Exit          int            `json:"exit"`
	Configuration *configuration `json:"configuration"`
	Error         *string        `json:"error"`
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == claudecode.HookSubcommand {
		os.Exit(claudecode.RunHook(os.Args[2:], os.Stdin, os.Stdout, os.Stderr))
	}
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: kogen-setup <checkout>")
		os.Exit(2)
	}
	env := os.Environ()
	s := sys.NewWith(env, os.Args[1])
	s.Stdout, s.Stderr = os.Stderr, os.Stderr
	exit, err := setup.Init(s.Context(), s, setup.InitInput{
		Client: provider.NewClient("dev"),
		Tools:  verify.Tools{Node: os.Getenv("KOGEN_NODE"), Quint: os.Getenv("KOGEN_QUINT"), Cucumber: os.Getenv("KOGEN_CUCUMBER")},
	})
	r := result{Exit: exit}
	if err != nil {
		message := err.Error()
		r.Error = &message
		if se, ok := sys.AsError(err); ok {
			fmt.Fprint(os.Stderr, se.Render())
		} else {
			fmt.Fprintln(os.Stderr, message)
		}
	}
	if repo, err := git.Open(s.Cwd, s.Env); err == nil {
		if _, err := project.LoadConfig(repo.Dir); err == nil {
			if content, err := os.ReadFile(filepath.Join(repo.Dir, project.ConfigPath)); err == nil && utf8.Valid(content) {
				r.Configuration = &configuration{Path: project.ConfigPath, Content: string(content)}
			}
		}
	}
	if err := json.NewEncoder(os.Stdout).Encode(r); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	os.Exit(exit)
}
