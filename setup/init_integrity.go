package setup

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"

	"github.com/KogenAI/kogen-coordinator/project"
)

type initIntegrityFile struct {
	path   string
	data   []byte
	mode   os.FileMode
	exists bool
	dir    bool // a directory that did not exist when the snapshot was taken
}

func initSnapshot(root string, paths []string) ([]initIntegrityFile, error) {
	var saved []initIntegrityFile
	var dirs []initIntegrityFile
	seen := map[string]bool{}
	for _, p := range paths {
		for d := filepath.Dir(p); d != "." && d != string(filepath.Separator) && !seen[d]; d = filepath.Dir(d) {
			seen[d] = true
			if _, err := os.Lstat(filepath.Join(root, d)); os.IsNotExist(err) {
				dirs = append(dirs, initIntegrityFile{path: d, dir: true})
			} else if err != nil {
				return nil, err
			}
		}
	}
	for _, p := range paths {
		name := filepath.Join(root, p)
		info, err := os.Stat(name)
		if os.IsNotExist(err) {
			saved = append(saved, initIntegrityFile{path: p})
			continue
		}
		if err != nil {
			return nil, err
		}
		data, err := os.ReadFile(name)
		if err != nil {
			return nil, err
		}
		saved = append(saved, initIntegrityFile{p, data, info.Mode(), true, false})
	}
	return append(saved, dirs...), nil
}
func initRestore(root string, saved []initIntegrityFile) error {
	var first error
	var dirs []string
	for _, f := range saved {
		if f.dir {
			dirs = append(dirs, f.path)
			continue
		}
		name := filepath.Join(root, f.path)
		var err error
		if f.exists {
			err = os.WriteFile(name, f.data, f.mode.Perm())
			if err == nil {
				err = os.Chmod(name, f.mode.Perm())
			}
		} else {
			err = os.Remove(name)
			if os.IsNotExist(err) {
				err = nil
			}
		}
		if err != nil && first == nil {
			first = err
		}
	}
	// Remove the directories the snapshot found missing, deepest first. One that
	// still holds other content stays.
	sort.Slice(dirs, func(i, j int) bool {
		return strings.Count(dirs[i], string(filepath.Separator)) > strings.Count(dirs[j], string(filepath.Separator))
	})
	for _, d := range dirs {
		err := os.Remove(filepath.Join(root, d))
		if err != nil && !os.IsNotExist(err) && !errors.Is(err, syscall.ENOTEMPTY) && !errors.Is(err, syscall.EEXIST) && first == nil {
			first = err
		}
	}
	return first
}

func initCompareConfig(want, got *project.Config) error {
	compare := func(label string, a, b []string) error {
		for i := 0; i < len(a) || i < len(b); i++ {
			if i >= len(a) {
				return fmt.Errorf("written configuration %s entry %d unexpected %q", label, i+1, b[i])
			}
			if i >= len(b) {
				return fmt.Errorf("written configuration %s entry %d missing %q", label, i+1, a[i])
			}
			if a[i] != b[i] {
				return fmt.Errorf("written configuration %s entry %d differs: %q != %q", label, i+1, a[i], b[i])
			}
		}
		return nil
	}
	if err := compare("setup", want.Setup, got.Setup); err != nil {
		return err
	}
	if err := compare("fix", want.Fix, got.Fix); err != nil {
		return err
	}
	for i := 0; i < len(want.Checks) || i < len(got.Checks); i++ {
		if i >= len(want.Checks) {
			return fmt.Errorf("written configuration checks entry %d unexpected %q (%q)", i+1, got.Checks[i].Name, got.Checks[i].Run)
		}
		if i >= len(got.Checks) {
			return fmt.Errorf("written configuration checks entry %d missing %q (%q)", i+1, want.Checks[i].Name, want.Checks[i].Run)
		}
		a, b := want.Checks[i], got.Checks[i]
		if a.Name != b.Name || a.Run != b.Run {
			return fmt.Errorf("written configuration checks entry %d %q (%q) differs from %q (%q)", i+1, a.Name, a.Run, b.Name, b.Run)
		}
	}
	if err := compare("protect", want.Protect, got.Protect); err != nil {
		return err
	}
	if (want.Acceptance == nil) != (got.Acceptance == nil) {
		return fmt.Errorf("written configuration acceptance presence differs: verified %v, written %v", want.Acceptance, got.Acceptance)
	}
	if want.Acceptance != nil {
		if want.Acceptance.Run != got.Acceptance.Run {
			return fmt.Errorf("written configuration acceptance run differs: %q != %q", want.Acceptance.Run, got.Acceptance.Run)
		}
		if want.Acceptance.StepsDir != got.Acceptance.StepsDir {
			return fmt.Errorf("written configuration acceptance steps directory differs: %q != %q", want.Acceptance.StepsDir, got.Acceptance.StepsDir)
		}
	}
	return nil
}
