package setup

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/claudecode"
	"kogen-loop/provider"
	"kogen-loop/sys"
)

type initRoute struct{ name, model string }

func initSelectRoute(s *sys.Session, home string) (initRoute, error) {
	var routes []initRoute
	for _, p := range provider.Catalog() {
		if p.Name == "openai-compatible" {
			continue
		}
		if provider.RequireLogin(home, []provider.Role{{Provider: p.Name}}) == nil {
			model := ""
			if len(p.Models) > 0 {
				model = p.Models[0]
			}
			routes = append(routes, initRoute{p.Name, model})
		}
	}
	if _, ok := provider.ClaudeCodeToken(home); ok {
		routes = append(routes, initRoute{"claude-code", "claude-sonnet-5-5"})
	}
	if len(routes) == 0 {
		for _, line := range provider.Status(home) {
			if strings.HasPrefix(line, "openai-compatible:") {
				return initRoute{}, sys.Fail("provider", "login", "OpenAI-compatible requires a host/base URL and model; a saved key alone is not a route. Sign in with a supported provider using kogen provider login.", 4)
			}
		}
		return initRoute{}, sys.Fail("provider", "login", "not signed in; run kogen provider login for a supported provider", 4)
	}
	if len(routes) > 1 {
		s.Progress("Select a route for discovery and the initial shape, build and review roles:")
		for i, r := range routes {
			s.Progress(fmt.Sprintf("%d. %s", i+1, r.name))
		}
		st, err := os.Stdin.Stat()
		if err != nil || st.Mode()&os.ModeCharDevice == 0 {
			return initRoute{}, sys.Fail("provider", "selection_required", "select a route in a terminal before initialization", 4)
		}
		line, err := bufio.NewReader(os.Stdin).ReadString('\n')
		if err != nil {
			return initRoute{}, sys.Fail("provider", "selection_required", "select a route; no choice was made", 4)
		}
		n, err := strconv.Atoi(strings.TrimSpace(line))
		if err != nil || n < 1 || n > len(routes) {
			return initRoute{}, sys.Fail("provider", "selection_required", "invalid route selection", 4)
		}
		routes = routes[n-1 : n]
	}
	s.Progress("kogen: selected " + routes[0].name + " for discovery and shape, build and review")
	return routes[0], nil
}

func (r initRoute) models() map[string]project.Role {
	models := project.DefaultModels()
	if r.name == "chatgpt" {
		for k, v := range models {
			v.Provider = r.name
			models[k] = v
		}
		return models
	}
	for _, name := range project.ModelRoles {
		effort := "high"
		if name == "build" {
			effort = "medium"
			if r.name == "opencode-go" {
				effort = "default"
			}
		}
		role := project.Role{Provider: r.name, Model: r.model, Effort: effort}
		if r.name == "claude-code" {
			role.Provider = ""
			role.Executor = project.ExecutorClaudeCode
		}
		models[name] = role
	}
	return models
}

func initRenderConfig(cfg *project.Config, route initRoute) string {
	rendered := project.RenderConfig(cfg)
	text := rendered[:strings.LastIndex(rendered, "\nmodels:\n")+1]
	var b strings.Builder
	b.WriteString(text + "models:\n")
	models := route.models()
	for _, name := range project.ModelRoles {
		r := models[name]
		fmt.Fprintf(&b, "  %s:\n", name)
		if r.Provider != "" {
			fmt.Fprintf(&b, "    provider: %s\n", r.Provider)
		}
		if r.Executor != "" {
			fmt.Fprintf(&b, "    executor: %s\n", r.Executor)
		}
		fmt.Fprintf(&b, "    model: %s\n    effort: %s\n", r.Model, r.Effort)
	}
	return b.String()
}

func initClaudeConverse(ctx context.Context, s *sys.Session, home string, role project.Role, input []any, vctx InitContext) (InitProposal, error) {
	token, _ := provider.ClaudeCodeToken(home)
	exe, err := os.Executable()
	if err != nil {
		return InitProposal{}, err
	}
	dir, err := os.MkdirTemp("", "kogen-init-executor-")
	if err != nil {
		return InitProposal{}, err
	}
	defer os.RemoveAll(dir)
	schema, err := json.Marshal(submitConfigurationDef()["parameters"])
	if err != nil {
		return InitProposal{}, err
	}
	a := claudecode.New(claudecode.Options{Home: home, Env: s.Env, Stderr: s.Stderr, Token: token, HookCommand: []string{exe, claudecode.HookSubcommand}})
	body, _ := json.Marshal(input)
	session, err := a.Start(ctx, executor.Task{Role: executor.RoleShape, Root: s.Cwd, Home: home, Dir: dir, Model: role.Model, Effort: role.Effort, Schema: schema, Brief: executor.Brief{Stable: InitInstructions(), Dynamic: string(body)}}, nil)
	if err != nil {
		return InitProposal{}, err
	}
	defer session.Close()
	feedback := ""
	for attempt := 0; attempt < 2; attempt++ {
		result, err := session.Round(ctx, executor.Input{Feedback: feedback})
		if err != nil {
			return InitProposal{}, err
		}
		var args map[string]any
		if json.Unmarshal(result.Structured, &args) == nil && args != nil {
			proposal, problems := Validate(args, vctx)
			if len(problems) == 0 {
				return proposal, nil
			}
			feedback = "invalid: " + strings.Join(problems, "; ")
		} else {
			feedback = "Answer with a valid configuration."
		}
	}
	return InitProposal{}, sys.Fail("provider", "init_invalid", "the model did not return a valid configuration; nothing was written", 4)
}
