Feature: Keep remote hosts out of checks and fixes
  This feature covers Validate refusing network-dependent commands.

  Scenario Outline: Refuse remote check commands
    When k-setup-check-needs-remote-host: Validate proposal:
      """
      {"checks":[{"name":"suite","run":"<command>"}]}
      """
    Then k-setup-check-needs-remote-host: problems equal:
      """
      ["check suite (<command>) contacts a remote host; checks must not depend on the network"]
      """
    Examples:
      | command |
      | curl -fsS https://api.example.invalid/health |
      | ping -c1 example.invalid |
      | nc example.invalid 443 |
      | git ls-remote https://example.invalid/r.git |
      | ssh user@example.invalid true |
      | go test ./... && wget https://example.invalid/x |

  Scenario: Refuse a remote fix command
    When k-setup-check-needs-remote-host: Validate proposal:
      """
      {"fix":["wget https://example.invalid/x.json -O x.json"],"checks":[{"name":"suite","run":"go test ./..."}]}
      """
    Then k-setup-check-needs-remote-host: problems equal:
      """
      ["fix command wget https://example.invalid/x.json -O x.json contacts a remote host"]
      """

  Scenario Outline: Allow loopback check targets
    When k-setup-check-needs-remote-host: Validate proposal:
      """
      {"checks":[{"name":"suite","run":"<command>"}]}
      """
    Then k-setup-check-needs-remote-host: problems equal:
      """
      []
      """
    Examples:
      | command |
      | curl -fsS http://localhost:8080/health |
      | curl -fsS http://127.0.0.1:3000 |
      | curl -fsS http://[::1]:3000/ |
      | nc localhost 80 |
      | go test ./... |

  Scenario: Allow setup downloads
    When k-setup-check-needs-remote-host: Validate proposal:
      """
      {"setup":["curl -fsSL -o tool.tgz https://example.invalid/tool.tgz"],"checks":[{"name":"suite","run":"go test ./..."}]}
      """
    Then k-setup-check-needs-remote-host: problems equal:
      """
      []
      """
