package setup

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/KogenAI/kogen-coordinator/project"
)

type initIntegrityFile struct {
	path   string
	data   []byte
	mode   os.FileMode
	exists bool
}

func initSnapshot(root string, paths []string) ([]initIntegrityFile, error) {
	var saved []initIntegrityFile
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
		saved = append(saved, initIntegrityFile{p, data, info.Mode(), true})
	}
	return saved, nil
}
func initRestore(root string, saved []initIntegrityFile) error {
	var first error
	for _, f := range saved {
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
