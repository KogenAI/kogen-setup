Feature: Validate literal remote hosts in command substitutions
  This feature validates proposed command text without running the proposed commands.

  Background:
    Given init-detect-nested-network-commands: the Validate driver is built

  Scenario: Refuse a remote substitution in a check
    When init-detect-nested-network-commands: Validate receives:
      """
      {"checks":[{"name":"probe","run":"printf '%s' $(curl https://example.invalid/health)"}]}
      """
    Then init-detect-nested-network-commands: the problems are:
      """
      ["check probe (printf '%s' $(curl https://example.invalid/health)) contacts a remote host; checks must not depend on the network"]
      """

  Scenario: Refuse an active double-quoted substitution in a fix
    When init-detect-nested-network-commands: Validate receives:
      """
      {"fix":["printf '%s' \"$(curl 'https://example.invalid/health')\""]}
      """
    Then init-detect-nested-network-commands: the problems are:
      """
      ["fix command printf '%s' \"$(curl 'https://example.invalid/health')\" contacts a remote host"]
      """

  Scenario: Refuse a backquoted substitution in setup
    When init-detect-nested-network-commands: Validate receives:
      """
      {"setup":["printf '%s' `curl https://example.invalid/health`"]}
      """
    Then init-detect-nested-network-commands: the problems are:
      """
      ["setup command printf '%s' `curl https://example.invalid/health` contacts a remote host"]
      """

  Scenario: Allow a substitution that contacts only localhost
    When init-detect-nested-network-commands: Validate receives:
      """
      {"checks":[{"name":"probe","run":"printf '%s' $(curl http://localhost:8080/health)"}]}
      """
    Then init-detect-nested-network-commands: the problems are:
      """
      []
      """

  Scenario: Ignore single-quoted substitution text
    When init-detect-nested-network-commands: Validate receives:
      """
      {"checks":[{"name":"probe","run":"printf '%s' '$(curl https://example.invalid/health)'"}]}
      """
    Then init-detect-nested-network-commands: the problems are:
      """
      []
      """

  Scenario: Ignore escaped substitution text in double quotes
    When init-detect-nested-network-commands: Validate receives:
      """
      {"checks":[{"name":"probe","run":"printf '%s' \"\\$(curl https://example.invalid/health)\""}]}
      """
    Then init-detect-nested-network-commands: the problems are:
      """
      []
      """

  Scenario: Detect a remote command inside another substitution
    When init-detect-nested-network-commands: Validate receives:
      """
      {"checks":[{"name":"probe","run":"printf '%s' \"$(printf '%s' \"$(curl https://example.invalid/health)\")\""}]}
      """
    Then init-detect-nested-network-commands: the problems are:
      """
      ["check probe (printf '%s' \"$(printf '%s' \"$(curl https://example.invalid/health)\")\") contacts a remote host; checks must not depend on the network"]
      """

  Scenario: Preserve the existing direct setup policy
    When init-detect-nested-network-commands: Validate receives:
      """
      {"setup":["curl https://example.invalid/health"]}
      """
    Then init-detect-nested-network-commands: the problems are:
      """
      []
      """
