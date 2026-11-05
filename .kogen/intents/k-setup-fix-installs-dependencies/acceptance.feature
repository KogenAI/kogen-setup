Feature: Keep dependency installation out of fix commands

  Scenario Outline: Refuse a fix command that installs dependencies
    When k-setup-fix-installs-dependencies: Validate proposal:
      """
      {"setup":[],"fix":["<command>"],"checks":[],"protect":[]}
      """
    Then k-setup-fix-installs-dependencies: problems equal:
      """
      ["fix command <command> installs dependencies; put the install in setup"]
      """
    And k-setup-fix-installs-dependencies: the proposal is:
      """
      {"setup":[],"fix":[]}
      """
    Examples:
      | command      |
      | npm install  |
      | mix deps.get |
      | npm ci       |
      | npm i        |

  Scenario: Accept a fix command that does not install
    When k-setup-fix-installs-dependencies: Validate proposal:
      """
      {"setup":[],"fix":["npm run format"],"checks":[],"protect":[]}
      """
    Then k-setup-fix-installs-dependencies: problems equal:
      """
      []
      """
    And k-setup-fix-installs-dependencies: the proposal is:
      """
      {"setup":[],"fix":["npm run format"]}
      """

  Scenario: Keep accepting the install as a setup command
    When k-setup-fix-installs-dependencies: Validate proposal:
      """
      {"setup":["npm install"],"fix":["npm run format"],"checks":[],"protect":[]}
      """
    Then k-setup-fix-installs-dependencies: problems equal:
      """
      []
      """
    And k-setup-fix-installs-dependencies: the proposal is:
      """
      {"setup":["npm install"],"fix":["npm run format"]}
      """

  Scenario: Keep the existing refusal of the install as a check
    When k-setup-fix-installs-dependencies: Validate proposal:
      """
      {"setup":[],"fix":[],"checks":[{"name":"suite","run":"npm install"}],"protect":[]}
      """
    Then k-setup-fix-installs-dependencies: problems equal:
      """
      ["check suite (npm install) installs dependencies; put the install in setup"]
      """

  Scenario: Keep other fix refusals after the install refusal
    When k-setup-fix-installs-dependencies: Validate proposal:
      """
      {"setup":[],"fix":["npm ci || true"],"checks":[],"protect":[]}
      """
    Then k-setup-fix-installs-dependencies: problems equal:
      """
      ["fix command npm ci || true installs dependencies; put the install in setup","fix command npm ci || true ignores its own failure"]
      """

  Scenario: Keep the control-character refusal alone for a fix entry
    When k-setup-fix-installs-dependencies: Validate proposal:
      """
      {"setup":[],"fix":["mix format\nmix deps.get"],"checks":[],"protect":[]}
      """
    Then k-setup-fix-installs-dependencies: problems equal:
      """
      ["fix entry 1 command \"mix format\\nmix deps.get\" contains a control character; put one command per entry"]
      """
