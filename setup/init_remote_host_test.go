package setup

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"
)

func TestInitContactsRemoteHost(t *testing.T) {
	cases := []struct {
		command string
		remote  bool
	}{
		{"curl -fsS https://api.example.invalid/health", true},
		{"curl -fsS \"https://api.example.invalid/health\"", true},
		{"wget https://example.invalid/x -O x", true},
		{"curl --url=https://api.example.invalid/health", true},
		{"wget --url=https://example.invalid/x", true},
		{"curl --url=http://localhost:8080/health", false},
		{"wget --url=http://localhost:8080/health", false},
		{"curl --url=file:///tmp/x", false},
		{"wget --url=file:///tmp/x", false},
		{"ping -c1 example.invalid", true},
		{"ping -c 1 example.invalid", true},
		{"nc example.invalid 443", true},
		{"telnet example.invalid 23", true},
		{"ssh user@example.invalid true", true},
		{"git fetch https://example.invalid/r.git main", true},
		{"git fetch -u https://example.invalid/r.git", true},
		{"git pull --strategy recursive https://example.invalid/r.git", true},
		{"git clone --bundle-uri https://example.invalid/bundle ./repo", false},
		{"git fetch -vo https://example.invalid/option ./repo", false},
		{"git clone '[::1]:repo' copy", false},
		{"git clone '[2001:db8::1]:repo' copy", true},
		{"git pull https://example.invalid/r.git main", true},
		{"git clone --depth 1 -- 'ssh://git@example.invalid/r.git' copy", true},
		{"git fetch git@example.invalid:o/r.git", true},
		{"git clone example.invalid:repo copy", true},
		{"git fetch --upload-pack https://example.invalid/tool ./repo main", false},
		{"git fetch ./repo https://example.invalid/ref", false},
		{"git clone ./repo git@example.invalid:copy", false},
		{"git pull file:///tmp/repo main", false},
		{"git fetch http://localhost:8080/repo", false},
		{"git ls-remote https://example.invalid/r.git", true},
		{"git ls-remote git@example.invalid:o/r.git", true},
		{"go test ./... && wget https://example.invalid/x", true},
		{"go test ./... && sudo curl https://example.invalid/x", true},
		{"curl -fsS http://localhost:8080/health", false},
		{"curl -fsS http://127.0.0.1:3000", false},
		{"curl -fsS http://[::1]:3000/", false},
		{"curl http://0.0.0.0:1", false},
		{"curl file:///tmp/x", false},
		{"nc localhost 80", false},
		{"ping -c 1 127.0.0.1", false},
		{"ssh user@localhost true", false},
		{"git ls-remote ./repo", false},
		{"git ls-remote /tmp/repo", false},
		{"git ls-remote origin", false},
		{"curl example.invalid", false},
		{"echo \"curl https://example.invalid\"", false},
		{"echo curl https://example.invalid", false},
		{"nc $HOST 80", false},
		{"curl https://$HOST/x", false},
		{"git ls-remote git@localhost:o/r.git", false},
		{"'curl' https://example.invalid/x", false},
		{"$COMMAND https://example.invalid/x", false},
		{"'sudo' curl https://example.invalid/x", false},
		{"sudo", false},
		{"go test ./...", false},
		{"echo $(curl https://example.invalid/x)", true},
		{`echo "$$ (curl https://example.invalid/x)"`, false},
		{`echo "\q$(curl https://example.invalid/x)"`, true},
		{"echo ok # $(curl https://example.invalid/x)", false},
		{`echo $(echo hi # $(curl https://example.invalid/x)
 echo ok)`, false},
		{`echo $(echo $(echo ok); curl https://example.invalid/x)`, true},
		{`echo $(curl https://$(echo example.invalid)/x)`, false},
		{"echo `curl https://example.invalid/x`", true},
		{"echo `echo \\$(curl https://example.invalid/x)`", true},
		{`echo $((1 + $(curl https://example.invalid/x)))`, true},
		{"echo $(curl http://localhost:8080/x)", false},
		{`echo "$(printf '%s' "$(curl https://example.invalid/x)")"`, true},
		{`echo "$(curl 'https://example.invalid/x')"`, true},
		{`echo '$(curl https://example.invalid/x)'`, false},
		{`echo "\$(curl https://example.invalid/x)"`, false},
		{"echo \\`curl https://example.invalid/x\\`", false},
	}
	for _, prefix := range []string{"", "sudo ", "env ", "command ", "time ", "env command time ", "sudo sudo "} {
		for _, tc := range cases {
			command := prefix + tc.command
			t.Run(command, func(t *testing.T) {
				if got := initContactsRemoteHost(command); got != tc.remote {
					t.Fatalf("initContactsRemoteHost(%q) = %v, want %v", command, got, tc.remote)
				}
			})
		}
	}
}

func TestInitValidatePullRemoteNames(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"origin", "repo.git"} {
		if err := os.Mkdir(filepath.Join(root, name), 0755); err != nil {
			t.Fatal(err)
		}
	}
	for _, args := range [][]string{{"init", root}, {"-C", root, "remote", "add", "origin", "./repo.git"}, {"-C", root, "remote", "add", "team/origin", "./repo.git"}} {
		if output, err := exec.Command("git", args...).CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v: %s", args, err, output)
		}
	}
	for _, tc := range []struct {
		command  string
		problems []string
	}{
		{"git fetch https://example.invalid/repo.git", []string{"check probe (git fetch https://example.invalid/repo.git) contacts a remote host; checks must not depend on the network"}},
		{"git clone https://example.invalid/repo.git copy", []string{"check probe (git clone https://example.invalid/repo.git copy) contacts a remote host; checks must not depend on the network"}},
		{"git push https://example.invalid/repo.git", []string{"check probe (git push https://example.invalid/repo.git) publishes or deploys"}},
		{"git pull team/origin main", []string{"check probe (git pull team/origin main) contacts a remote host; checks must not depend on the network"}},
		{"git pull origin main", []string{"check probe (git pull origin main) contacts a remote host; checks must not depend on the network"}},
		{"git pull repo.git main", nil},
		{"git pull ./origin main", nil},
	} {
		t.Run(tc.command, func(t *testing.T) {
			_, got := Validate(map[string]any{"checks": []any{map[string]any{"name": "probe", "run": tc.command}}}, InitContext{Root: root})
			if !reflect.DeepEqual(got, tc.problems) {
				t.Fatalf("problems = %v, want %v", got, tc.problems)
			}
		})
	}
}
