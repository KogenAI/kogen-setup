Feature: Detect equals-form URL options in supported network commands
  This feature exercises the existing setup.Validate entry point without executing
  curl or wget or contacting a network. The parser reads literal command text.
  The option spelling is a synthetic fixture choice, not an asserted command API.

  Background:
    Given init-detect-equals-url-option: the Validate driver is built

  Scenario: Detect curl equals-form remote URL
    When init-detect-equals-url-option: Validate curl with an equals-form URL option containing "https://api.example.invalid/health"
    Then init-detect-equals-url-option: problems equal:
      """
      ["check probe (<command>) contacts a remote host; checks must not depend on the network"]
      """

  Scenario: Detect wget equals-form remote URL
    When init-detect-equals-url-option: Validate wget with an equals-form URL option containing "https://example.invalid/x"
    Then init-detect-equals-url-option: problems equal:
      """
      ["check probe (<command>) contacts a remote host; checks must not depend on the network"]
      """

  Scenario Outline: Preserve local equals-form URL classification
    When init-detect-equals-url-option: Validate <program> with an equals-form URL option containing "<url>"
    Then init-detect-equals-url-option: problems equal:
      """
      []
      """

    Examples:
      | program | url                          |
      | curl    | http://localhost:8080/health |
      | wget    | http://localhost:8080/health |
      | curl    | file:///tmp/x               |
      | wget    | file:///tmp/x               |

  Scenario Outline: Preserve positional URL results
    When init-detect-equals-url-option: Validate check "<command>"
    Then init-detect-equals-url-option: problems equal:
      """
      <problems>
      """

    Examples:
      | command                                       | problems                                                                                                                               |
      | curl -fsS https://api.example.invalid/health    | ["check probe (curl -fsS https://api.example.invalid/health) contacts a remote host; checks must not depend on the network"]             |
      | wget https://example.invalid/x -O x            | ["check probe (wget https://example.invalid/x -O x) contacts a remote host; checks must not depend on the network"]                       |
      | curl -fsS http://localhost:8080/health          | []                                                                                                                                     |
      | wget http://localhost:8080/health               | []                                                                                                                                     |
      | curl -fsS http://127.0.0.1:3000                 | []                                                                                                                                     |
      | curl -fsS http://[::1]:3000/                    | []                                                                                                                                     |
      | curl http://0.0.0.0:1                          | []                                                                                                                                     |
      | curl file:///tmp/x                            | []                                                                                                                                     |
      | wget file:///tmp/x                            | []                                                                                                                                     |
      | curl example.invalid                          | []                                                                                                                                     |
