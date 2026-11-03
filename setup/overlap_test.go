package setup

import (
	"reflect"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
)

func TestSourceQualifiedOverlap(t *testing.T) {
	detected := project.Detected{Setup: []string{"npm ci --no-audit --no-fund"}, Checks: []project.Check{{Name: "test", Run: "npm test"}, {Name: "lint", Run: "lint"}}}
	proposal := InitProposal{Setup: []string{"npm run setup"}, Checks: []project.Check{{Name: "lint", Run: "lint-new"}, {Name: "a", Run: "npm run test-a"}, {Name: "b", Run: "npm run test-b"}}}
	tracked := []string{"test/a.test.cjs", "test/b.test.cjs"}
	for _, tc := range []struct {
		name, full string
		want       []project.Check
	}{
		{"full", "node --test test/a.test.cjs test/b.test.cjs", []project.Check{{Name: "test", Run: "npm test"}, {Name: "lint", Run: "lint-new"}}},
		{"filtered", "node --test test/a.test.cjs", []project.Check{{Name: "test", Run: "npm test"}, {Name: "lint", Run: "lint-new"}, {Name: "b", Run: "npm run test-b"}}},
		{"unknown", "node --test $PATHS", []project.Check{{Name: "test", Run: "npm test"}, {Name: "lint", Run: "lint-new"}, {Name: "a", Run: "npm run test-a"}, {Name: "b", Run: "npm run test-b"}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			manifest := `{"scripts":{"setup":"npm ci --no-audit --no-fund && node other.cjs","test":"` + tc.full + `","test-a":"node --test test/a.test.cjs","test-b":"node --test test/b.test.cjs"}}`
			merged := Merge(detected, proposal)
			setup, checks := initSelectOverlap(merged.Setup, merged.Checks, detected.Setup, map[string]string{"package.json": manifest}, tracked)
			if !reflect.DeepEqual(setup, []string{"npm run setup"}) || !reflect.DeepEqual(checks, tc.want) {
				t.Fatalf("setup=%v checks=%v", setup, checks)
			}
		})
	}
	t.Run("unproven setup and lifecycle effects", func(t *testing.T) {
		manifest := `{"scripts":{"setup":"echo skip || npm ci --no-audit --no-fund","test":"node --test test/a.test.cjs test/b.test.cjs","pretest":"node side-effect.cjs","test-a":"node --test test/a.test.cjs"}}`
		merged := Merge(detected, proposal)
		setup, checks := initSelectOverlap(merged.Setup, merged.Checks, detected.Setup, map[string]string{"package.json": manifest}, tracked)
		if !reflect.DeepEqual(setup, merged.Setup) || !reflect.DeepEqual(checks, merged.Checks) {
			t.Fatalf("setup=%v checks=%v", setup, checks)
		}
	})
}
