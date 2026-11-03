package setup

import (
	"sync"
	"testing"
)

// Copied from kogen-shaping shape/helper_test.go: the test helper the Init tests use.

// parallelTests are the tests already marked parallel (a test may build several fixtures).
var parallelTests sync.Map

// parallel makes the test run beside the others unless it already does: a test may call it
// at its start and build several fixtures, each of which calls it again.
func parallel(t *testing.T) {
	t.Helper()
	if _, again := parallelTests.LoadOrStore(t.Name(), true); !again {
		t.Parallel()
	}
}
