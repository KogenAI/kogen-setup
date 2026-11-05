Feature: Refuse fix commands that ignore their own failure

  Scenario: Refuse a fix command that ignores its own failure
    When k-setup-fix-masks-failure: Validate the proposal:
      """
      {"fix":["gofmt -w . || true"]}
      """
    Then k-setup-fix-masks-failure: the problems are:
      """
      ["fix command gofmt -w . || true ignores its own failure"]
      """
    And k-setup-fix-masks-failure: no proposal is returned

  Scenario: Accept a fix command that does not mask failure
    When k-setup-fix-masks-failure: Validate the proposal:
      """
      {"fix":["gofmt -w ."]}
      """
    Then k-setup-fix-masks-failure: the problems are:
      """
      []
      """
    And k-setup-fix-masks-failure: the returned fix commands are:
      """
      ["gofmt -w ."]
      """

  Scenario: Accept a fix command with real recovery
    When k-setup-fix-masks-failure: Validate the proposal:
      """
      {"fix":["gofmt -w . || (echo failed; exit 1)"]}
      """
    Then k-setup-fix-masks-failure: the problems are:
      """
      []
      """
    And k-setup-fix-masks-failure: the returned fix commands are:
      """
      ["gofmt -w . || (echo failed; exit 1)"]
      """

  Scenario Outline: Refuse the other recognized masking tails
    When k-setup-fix-masks-failure: Validate the proposal:
      """
      {"fix":["<command>"]}
      """
    Then k-setup-fix-masks-failure: the problems are:
      """
      ["fix command <command> ignores its own failure"]
      """
    And k-setup-fix-masks-failure: no proposal is returned
    Examples:
      | command               |
      | gofmt -w .; true      |
      | gofmt -w . \|\| :      |
      | gofmt -w . \|\| exit 0 |
      | gofmt -w . &          |

  Scenario: The same masking command as a check keeps its existing wording
    When k-setup-fix-masks-failure: Validate the proposal:
      """
      {"checks":[{"name":"format","run":"gofmt -w . || true"}]}
      """
    Then k-setup-fix-masks-failure: the problems are:
      """
      ["check format (gofmt -w . || true) ignores its own failure"]
      """
    And k-setup-fix-masks-failure: no proposal is returned

  Scenario: The same masking command as a setup command keeps its existing wording
    When k-setup-fix-masks-failure: Validate the proposal:
      """
      {"setup":["gofmt -w . || true"]}
      """
    Then k-setup-fix-masks-failure: the problems are:
      """
      ["setup command gofmt -w . || true ignores its own failure"]
      """
    And k-setup-fix-masks-failure: no proposal is returned

  Scenario: Only the masking entry among several fix commands is named
    When k-setup-fix-masks-failure: Validate the proposal:
      """
      {"fix":["gofmt -w .","gofmt -w . || true","mkdir -p tmp"]}
      """
    Then k-setup-fix-masks-failure: the problems are:
      """
      ["fix command gofmt -w . || true ignores its own failure"]
      """
    And k-setup-fix-masks-failure: no proposal is returned

  Scenario: A fix command that runs nothing and masks failure reports both, as setup does
    When k-setup-fix-masks-failure: Validate the proposal:
      """
      {"fix":["printf ok; true"]}
      """
    Then k-setup-fix-masks-failure: the problems are:
      """
      ["fix command printf ok; true runs nothing","fix command printf ok; true ignores its own failure"]
      """
    And k-setup-fix-masks-failure: no proposal is returned
