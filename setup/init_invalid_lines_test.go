package setup

import (
	"slices"
	"strconv"
	"testing"
)

func initInvalidField(field string) initSSE {
	args := map[string]any{"setup": []any{}, "fix": []any{}, "checks": []any{}, "protect": []any{}}
	args[field] = "no"
	return initSubmit(args)
}

func initInvalidLines(t *testing.T, script ...initSSE) []string {
	t.Helper()
	f := initNewFx(t, true, script...)
	f.write("notes.txt", "x\n")
	f.commitAll("a")
	return f.wantError("provider", "init_invalid", 4).Lines
}

func TestInitInvalidLinesNamesTheRejectedReason(t *testing.T) {
	parallel(t)
	bad := initInvalidField("setup")
	if got, want := initInvalidLines(t, bad, bad), []string{"setup must be a list"}; !slices.Equal(got, want) {
		t.Fatalf("lines %q, want %q", got, want)
	}
}

func TestInitInvalidLinesShowsOnlyTheLastAnswer(t *testing.T) {
	parallel(t)
	got := initInvalidLines(t, initInvalidField("setup"), initInvalidField("fix"))
	if want := []string{"fix must be a list"}; !slices.Equal(got, want) {
		t.Fatalf("lines %q, want %q", got, want)
	}
}

func TestInitInvalidLinesNoCallInTheLastAnswer(t *testing.T) {
	parallel(t)
	got := initInvalidLines(t, initInvalidField("setup"), initAnswerText("fine"))
	if want := []string{"the last answer did not call submit_configuration"}; !slices.Equal(got, want) {
		t.Fatalf("lines %q, want %q", got, want)
	}
}

func TestInitInvalidLinesBoundsTheList(t *testing.T) {
	parallel(t)
	for n, tail := range map[int]string{7: "and 2 more problems", 6: "and 1 more problem"} {
		var problems, want []string
		for i := 1; i <= n; i++ {
			problems = append(problems, "problem "+strconv.Itoa(i))
		}
		want = append(slices.Clone(problems[:5]), tail)
		e := initInvalidError(problems)
		if e.Class != "provider" || e.Reason != "init_invalid" || e.Exit != 4 || !slices.Equal(e.Lines, want) {
			t.Fatalf("%d problems: %v lines %q, want %q", n, e, e.Lines, want)
		}
	}
	if e := initInvalidError([]string{"a", "b"}); !slices.Equal(e.Lines, []string{"a", "b"}) {
		t.Fatalf("lines %q", e.Lines)
	}
}
