Feature: Detect literal remote hosts through transparent prefixes
  This feature preserves literal-target classification and the existing validation diagnostics.
  Commands are inspected, never executed against their targets.

  Background:
    Given init-network-wrappers: the Validate driver is built

  Scenario Outline: Refuse direct and wrapped remote checks
    When init-network-wrappers: Validate "<command>" as check
    Then init-network-wrappers: problems equal:
      """
      ["check probe (<command>) contacts a remote host; checks must not depend on the network"]
      """

    Examples:
      | command                                          |
      | curl https://example.invalid/x                   |
      | wget https://example.invalid/x                   |
      | ping example.invalid                             |
      | ssh user@example.invalid true                    |
      | git ls-remote https://example.invalid/r.git       |
      | sudo curl https://example.invalid/x              |
      | sudo wget https://example.invalid/x              |
      | sudo ping example.invalid                        |
      | sudo ssh user@example.invalid true               |
      | sudo git ls-remote https://example.invalid/r.git  |
      | env curl https://example.invalid/x               |
      | env wget https://example.invalid/x               |
      | env ping example.invalid                         |
      | env ssh user@example.invalid true                |
      | env git ls-remote https://example.invalid/r.git   |
      | command curl https://example.invalid/x           |
      | command wget https://example.invalid/x           |
      | command ping example.invalid                     |
      | command ssh user@example.invalid true            |
      | command git ls-remote https://example.invalid/r.git |
      | time curl https://example.invalid/x              |
      | time wget https://example.invalid/x              |
      | time ping example.invalid                        |
      | time ssh user@example.invalid true               |
      | time git ls-remote https://example.invalid/r.git  |
      | env command time curl https://example.invalid/x  |
      | go test ./... && sudo curl https://example.invalid/x |

  Scenario Outline: Preserve non-remote wrapped targets
    When init-network-wrappers: Validate "<command>" as check
    Then init-network-wrappers: problems equal:
      """
      []
      """

    Examples:
      | command                                   |
      | sudo curl http://localhost:8080/health     |
      | env curl http://127.0.0.1:3000             |
      | command curl http://[::1]:3000/           |
      | time curl http://0.0.0.0:1                |
      | sudo wget file:///tmp/x                  |
      | env git ls-remote ./repo                 |
      | command git ls-remote /tmp/repo           |
      | time git ls-remote origin                |
      | sudo ping -c 1 127.0.0.1                 |
      | env ssh user@localhost true              |
      | command git ls-remote git@localhost:o/r.git |
      | time curl example.invalid                |
      | env curl https://$HOST/x                 |
      | command echo curl https://example.invalid/x |

  Scenario Outline: Refuse wrapped remote fixers with the fixer diagnostic
    When init-network-wrappers: Validate "<command>" as fix
    Then init-network-wrappers: problems equal:
      """
      ["fix command <command> contacts a remote host"]
      """

    Examples:
      | command                                         |
      | sudo curl https://example.invalid/x             |
      | env wget https://example.invalid/x              |
      | command ping example.invalid                   |
      | time ssh user@example.invalid true             |
      | env git ls-remote git@example.invalid:o/r.git   |
