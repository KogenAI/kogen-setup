Feature: Accept tabs inside setup, fix and check commands

  Scenario: A check with a tab inside a quoted argument is accepted unchanged
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"checks":[{"name":"cols","run":"printf 'a\tb\\n' | cut -f2"}]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      []
      """
    And k-setup-command-tab-not-control: the accepted proposal equals:
      """
      {"setup":[],"fix":[],"checks":[{"name":"cols","run":"printf 'a\tb\\n' | cut -f2"}]}
      """

  Scenario: Setup and fix commands with a tab between words are accepted unchanged
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"setup":["mix\tdeps.get"],"fix":["mix\tformat"]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      []
      """
    And k-setup-command-tab-not-control: the accepted proposal equals:
      """
      {"setup":["mix\tdeps.get"],"fix":["mix\tformat"],"checks":[]}
      """

  Scenario: Init writes the tab check and reads it back byte for byte
    When k-setup-command-tab-not-control: Init runs once with the proposal:
      """
      {"setup":[],"fix":[],"checks":[{"name":"cols","run":"printf 'a\tb\\n' | cut -f2"}],"protect":[]}
      """
    Then k-setup-command-tab-not-control: the Init outcome equals:
      """
      {"exit":0,"error":"","requests":1}
      """
    And k-setup-command-tab-not-control: the Init output includes the line:
      """
      "Checks: cols"
      """
    And k-setup-command-tab-not-control: the written configuration includes the line:
      """
      "      run: 'printf ''a\tb\\n'' | cut -f2'"
      """
    And k-setup-command-tab-not-control: the configuration read back equals:
      """
      {"setup":[],"fix":[],"checks":[{"name":"cols","run":"printf 'a\tb\\n' | cut -f2"}]}
      """

  Scenario: A setup command with a newline between two commands is still refused as before
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"setup":["set -e\nnpm ci"]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      ["setup entry 1 command \"set -e\\nnpm ci\" contains a control character; put one command per entry"]
      """

  Scenario: Commands with a carriage return are still refused in setup, fix and checks
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"setup":["mix deps.get\r"]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      ["setup entry 1 command \"mix deps.get\\r\" contains a control character; put one command per entry"]
      """
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"fix":["mix format\r"]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      ["fix entry 1 command \"mix format\\r\" contains a control character; put one command per entry"]
      """
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"checks":[{"name":"test","run":"mix test\r"}]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      ["check test command \"mix test\\r\" contains a control character; put one command per entry"]
      """

  Scenario: Commands with a bell are still refused in setup, fix and checks
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"setup":["mix deps.get\u0007"]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      ["setup entry 1 command \"mix deps.get\\a\" contains a control character; put one command per entry"]
      """
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"fix":["mix format\u0007"]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      ["fix entry 1 command \"mix format\\a\" contains a control character; put one command per entry"]
      """
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"checks":[{"name":"test","run":"mix test\u0007"}]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      ["check test command \"mix test\\a\" contains a control character; put one command per entry"]
      """

  Scenario: Commands made only of whitespace including tabs are refused as empty
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"setup":["\t"]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      ["setup must be a list of non-empty commands"]
      """
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"setup":[" \t "]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      ["setup must be a list of non-empty commands"]
      """
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"fix":["\t"]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      ["fix must be a list of non-empty commands"]
      """
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"checks":[{"name":"cols","run":"\t"}]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      ["check cols has no command"]
      """

  Scenario: Whitespace-only commands with a newline or carriage return keep the control-character refusal
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"setup":["\n"]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      ["setup entry 1 command \"\\n\" contains a control character; put one command per entry"]
      """
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"checks":[{"name":"test","run":"\r"}]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      ["check test command \"\\r\" contains a control character; put one command per entry"]
      """

  Scenario: A command with a tab is still judged by the other rules
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"setup":["npm install -g x\t"]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      ["setup command npm install -g x\t is a one-time machine prerequisite, not recurring project setup"]
      """

  Scenario: A tab in a check name is still refused and shown quoted
    When k-setup-command-tab-not-control: Validate the proposal:
      """
      {"checks":[{"name":"lint\t","run":"make lint"}]}
      """
    Then k-setup-command-tab-not-control: the problems equal:
      """
      ["check name \"lint\\t\" must be lowercase letters, digits and dashes"]
      """
