Feature: Refuse check names longer than 64 characters

  Scenario: A 64-character name passes the name rule; run true keeps only its existing runs-nothing refusal
    When k-setup-check-name-length-bounded: Validate checks:
      """
      [{"name":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","run":"true"}]
      """
    Then k-setup-check-name-length-bounded: problems equal:
      """
      ["check aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa (true) runs nothing"]
      """

  Scenario: A 64-character name with a real command is accepted into the proposal as given
    When k-setup-check-name-length-bounded: Validate a check named "" followed by "a" repeated 64 times with run "make lint"
    Then k-setup-check-name-length-bounded: problems equal:
      """
      []
      """
    And k-setup-check-name-length-bounded: proposed checks equal:
      """
      [{"name":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","run":"make lint"}]
      """

  Scenario: A 65-character name is refused with the bounded wording
    When k-setup-check-name-length-bounded: Validate a check named "" followed by "a" repeated 65 times with run "make lint"
    Then k-setup-check-name-length-bounded: problems equal:
      """
      ["check name aaaaaaaaaaaaaaaaaaaa… is longer than 64 characters"]
      """
    And k-setup-check-name-length-bounded: proposed checks equal:
      """
      []
      """

  Scenario: A name of thousands of characters gets the same short refusal
    When k-setup-check-name-length-bounded: Validate a check named "" followed by "a" repeated 5000 times with run "make lint"
    Then k-setup-check-name-length-bounded: problems equal:
      """
      ["check name aaaaaaaaaaaaaaaaaaaa… is longer than 64 characters"]
      """
    And k-setup-check-name-length-bounded: every problem is shorter than 100 characters
    And k-setup-check-name-length-bounded: proposed checks equal:
      """
      []
      """

  Scenario: A 65-character name that also breaks the character rule gets one refusal
    When k-setup-check-name-length-bounded: Validate a check named "A" followed by "a" repeated 64 times with run "make lint"
    Then k-setup-check-name-length-bounded: problems equal:
      """
      ["check name Aaaaaaaaaaaaaaaaaaaa… is longer than 64 characters"]
      """
    And k-setup-check-name-length-bounded: proposed checks equal:
      """
      []
      """

  Scenario: A too-long name with a control character in its first 20 characters shows them quoted
    When k-setup-check-name-length-bounded: Validate checks:
      """
      [{"name":"lint\naaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","run":"make lint"}]
      """
    Then k-setup-check-name-length-bounded: problems equal:
      """
      ["check name \"lint\\naaaaaaaaaaaaaaa\"… is longer than 64 characters"]
      """

  Scenario: go-vet2 stays accepted
    When k-setup-check-name-length-bounded: Validate checks:
      """
      [{"name":"go-vet2","run":"go vet ./..."}]
      """
    Then k-setup-check-name-length-bounded: problems equal:
      """
      []
      """
    And k-setup-check-name-length-bounded: proposed checks equal:
      """
      [{"name":"go-vet2","run":"go vet ./..."}]
      """

  Scenario: Lint keeps its existing wording
    When k-setup-check-name-length-bounded: Validate checks:
      """
      [{"name":"Lint","run":"make lint"}]
      """
    Then k-setup-check-name-length-bounded: problems equal:
      """
      ["check name Lint must be lowercase letters, digits and dashes"]
      """
