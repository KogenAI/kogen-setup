package setup

import (
	"fmt"
	"strings"

	"github.com/KogenAI/kogen-loop/sys"
)

func initRouteNames(routes []initRoute) string {
	names := make([]string, 0, len(routes))
	for _, route := range routes {
		names = append(names, route.name)
	}
	return strings.Join(names, ", ")
}

func initRouteFromEnv(s *sys.Session, routes []initRoute) (initRoute, bool, error) {
	name := s.Getenv("KOGEN_INIT_ROUTE")
	if name == "" {
		return initRoute{}, false, nil
	}
	for _, route := range routes {
		if route.name == name {
			s.Progress("kogen: selected " + route.name + " for discovery and shape, build and review")
			return route, true, nil
		}
	}
	return initRoute{}, true, sys.Fail("provider", "selection_required", fmt.Sprintf("KOGEN_INIT_ROUTE %q is not an available route; available routes: %s", name, initRouteNames(routes)), 4)
}

func initRouteNonterminalMessage(routes []initRoute) string {
	return "select a route in a terminal before initialization or set KOGEN_INIT_ROUTE to one of: " + initRouteNames(routes)
}
