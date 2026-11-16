package setup

import "testing"

const initRefusalCommitFirst = `; commit them first (git add -A && git commit -m "Initial commit"), then run kogen init`

func TestInitRefusalPathsDirtyTreeNamesEveryPath(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true)
	f.write("README.md", "x")
	f.commitAll("first")
	f.write(".gitignore", "changed")
	f.write("features/steps/README.md", "changed")
	e := f.wantError("environment", "dirty_tree", 5)
	want := ".gitignore, features/steps/README.md have uncommitted changes; commit, stash or discard them first"
	if e.Detail != want {
		t.Fatal(e.Detail)
	}
	if f.exists(".kogen") {
		t.Fatal("wrote .kogen")
	}
}

func TestInitRefusalPathsNoCommitsBoundsTheNames(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true)
	for _, n := range initPathListFiles("f", "txt") {
		f.write(n, "x")
	}
	e := f.wantError("environment", "no_commits", 3)
	want := "7 file(s) are not committed yet (f1.txt, f2.txt, f3.txt, f4.txt, f5.txt and 2 more)" + initRefusalCommitFirst
	if e.Detail != want {
		t.Fatal(e.Detail)
	}
}

func TestInitRefusalPathsNoCommitsNamesShortListInFull(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true)
	f.write("a.txt", "x")
	f.write("b.txt", "x")
	f.write(".gitignore", "x")
	e := f.wantError("environment", "no_commits", 3)
	want := "2 file(s) are not committed yet (a.txt, b.txt)" + initRefusalCommitFirst
	if e.Detail != want {
		t.Fatal(e.Detail)
	}
}
