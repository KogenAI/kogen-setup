package setup

import "testing"

func TestInitContactsRemoteHost(t *testing.T) {
	cases := []struct {
		command string
		remote  bool
	}{
		{"curl -fsS https://api.example.invalid/health", true},
		{"curl -fsS \"https://api.example.invalid/health\"", true},
		{"wget https://example.invalid/x -O x", true},
		{"ping -c1 example.invalid", true},
		{"ping -c 1 example.invalid", true},
		{"nc example.invalid 443", true},
		{"telnet example.invalid 23", true},
		{"ssh user@example.invalid true", true},
		{"git ls-remote https://example.invalid/r.git", true},
		{"git ls-remote git@example.invalid:o/r.git", true},
		{"go test ./... && wget https://example.invalid/x", true},
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
		{"go test ./...", false},
	}
	for _, tc := range cases {
		t.Run(tc.command, func(t *testing.T) {
			if got := initContactsRemoteHost(tc.command); got != tc.remote {
				t.Fatalf("initContactsRemoteHost(%q) = %v, want %v", tc.command, got, tc.remote)
			}
		})
	}
}
