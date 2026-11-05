Feature: Refuse check names with a trailing newline

  Scenario: A check name with a trailing newline is refused by the name rule
    When k-setup-check-name-trailing-newline: Validate checks:
      """
      [{"name":"lint\n","run":"true"}]
      """
    Then k-setup-check-name-trailing-newline: problems equal:
      """
      ["check name \"lint\\n\" must be lowercase letters, digits and dashes"]
      """
    And k-setup-check-name-trailing-newline: proposed checks equal:
      """
      []
      """

  Scenario: The plain name lint with run true keeps its current outcome
    When k-setup-check-name-trailing-newline: Validate checks:
      """
      [{"name":"lint","run":"true"}]
      """
    Then k-setup-check-name-trailing-newline: problems equal:
      """
      ["check lint (true) runs nothing"]
      """

  Scenario: Valid check names are accepted into the proposal as given
    When k-setup-check-name-trailing-newline: Validate checks:
      """
      [{"name":"lint","run":"make lint"}]
      """
    Then k-setup-check-name-trailing-newline: problems equal:
      """
      []
      """
    And k-setup-check-name-trailing-newline: proposed checks equal:
      """
      [{"name":"lint","run":"make lint"}]
      """
    When k-setup-check-name-trailing-newline: Validate checks:
      """
      [{"name":"go-vet2","run":"go vet ./..."}]
      """
    Then k-setup-check-name-trailing-newline: problems equal:
      """
      []
      """
    And k-setup-check-name-trailing-newline: proposed checks equal:
      """
      [{"name":"go-vet2","run":"go vet ./..."}]
      """

  Scenario Outline: Other invalid names stay refused with the unchanged wording
    When k-setup-check-name-trailing-newline: Validate checks:
      """
      [{"name":"<name>","run":"make lint"}]
      """
    Then k-setup-check-name-trailing-newline: problems equal:
      """
      ["check name <name> must be lowercase letters, digits and dashes"]
      """
    Examples:
      | name    |
      | Lint    |
      | lint_   |
      | -lint   |
      | lint--x |

  Scenario: A name with a trailing space stays refused with the unchanged wording
    When k-setup-check-name-trailing-newline: Validate checks:
      """
      [{"name":"lint ","run":"make lint"}]
      """
    Then k-setup-check-name-trailing-newline: problems equal:
      """
      ["check name lint  must be lowercase letters, digits and dashes"]
      """

  Scenario: A name with a tab is refused and shown quoted
    When k-setup-check-name-trailing-newline: Validate checks:
      """
      [{"name":"lint\t","run":"make lint"}]
      """
    Then k-setup-check-name-trailing-newline: problems equal:
      """
      ["check name \"lint\\t\" must be lowercase letters, digits and dashes"]
      """

  Scenario: A newline variant of a proposed name is refused, not accepted as a distinct check
    When k-setup-check-name-trailing-newline: Validate checks:
      """
      [{"name":"lint","run":"make lint"},{"name":"lint\n","run":"make lint"}]
      """
    Then k-setup-check-name-trailing-newline: problems equal:
      """
      ["check name \"lint\\n\" must be lowercase letters, digits and dashes"]
      """
    And k-setup-check-name-trailing-newline: proposed checks equal:
      """
      []
      """

  Scenario: lint and lint with a newline, both run true, in one proposal
    When k-setup-check-name-trailing-newline: Validate checks:
      """
      [{"name":"lint","run":"true"},{"name":"lint\n","run":"true"}]
      """
    Then k-setup-check-name-trailing-newline: problems equal:
      """
      ["check name \"lint\\n\" must be lowercase letters, digits and dashes", "check lint (true) runs nothing"]
      """
