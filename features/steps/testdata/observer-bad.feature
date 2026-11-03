Feature: Observer control (known bad): the acceptance steps reject wrong expectations

  Each scenario repeats the known-good setup and ends with one wrong expectation, so every
  scenario must fail at its last step.

  Scenario: Rejects wrong exit status
    Given the model proposes the fix commands:
      | true |
    And the model proposes the check "ok" running "echo checked >> \"$FIX_LOG\""
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And init exits with status 1

  Scenario: Rejects Left out lacks the part
    Given the model proposes the fix commands:
      | true |
    And the model proposes the check "ok" running "echo checked >> \"$FIX_LOG\""
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And the "Left out:" line contains "fix-1"

  Scenario: Rejects a Checks line that lacks the part
    Given the model proposes the fix commands:
      | true |
    And the model proposes the check "ok" running "echo checked >> \"$FIX_LOG\""
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And the "Checks:" line contains "bad"

  Scenario: Rejects Left out contains the part
    Given the model proposes the fix commands:
      | true |
    And the model proposes the check "ok" running "echo checked >> \"$FIX_LOG\""
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And the "Left out:" line does not contain "bad (exit 7)"

  Scenario: Rejects stdout differs
    Given the model proposes the fix commands:
      | true |
    And the model proposes the check "ok" running "echo checked >> \"$FIX_LOG\""
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And stdout is:
      """
      Initialized Kogen in {repo}
      Setup: none
      Checks: ok
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha8} Add Kogen configuration
      """

  Scenario: Rejects line present
    Given the model proposes the fix commands:
      | true |
    And the model proposes the check "ok" running "echo checked >> \"$FIX_LOG\""
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And stdout has no "Left out:" line

  Scenario: Rejects wrong fix list
    Given the model proposes the fix commands:
      | true |
    And the model proposes the check "ok" running "echo checked >> \"$FIX_LOG\""
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And project.yaml lists the fix commands:
      | true  |
      | false |

  Scenario: Rejects fix list not empty
    Given the model proposes the fix commands:
      | true |
    And the model proposes the check "ok" running "echo checked >> \"$FIX_LOG\""
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And project.yaml lists no fix command

  Scenario: Rejects wrong check list
    Given the model proposes the fix commands:
      | true |
    And the model proposes the check "ok" running "echo checked >> \"$FIX_LOG\""
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And project.yaml lists the checks:
      | ok  |
      | bad |

  Scenario: Rejects missing config line
    Given the model proposes the fix commands:
      | true |
    And the model proposes the check "ok" running "echo checked >> \"$FIX_LOG\""
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And project.yaml contains the line "  fix: []            # deterministic fixers, run once after each builder round"

  Scenario: Rejects missing stderr line
    Given the model proposes the fix commands:
      | true |
    And the model proposes the check "ok" running "echo checked >> \"$FIX_LOG\""
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And stderr contains the line "kogen: running fix-2: true"

  Scenario: Rejects wrong stderr order
    Given the model proposes the fix commands:
      | true |
    And the model proposes the check "ok" running "echo checked >> \"$FIX_LOG\""
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And stderr has the line "kogen: checking bad: exit 7" before the line "kogen: checking the acceptance runner"

  Scenario: Rejects stderr line present
    Given the model proposes the fix commands:
      | true |
    And the model proposes the check "ok" running "echo checked >> \"$FIX_LOG\""
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And stderr has no line starting with "kogen: checking "

  Scenario: Rejects wrong fix log
    Given the model proposes the fix commands:
      | true |
    And the model proposes the check "ok" running "echo checked >> \"$FIX_LOG\""
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And the fix commands wrote to the fix log, in order:
      | checked |
      | checked |

  Scenario: Rejects wrong README
    Given the model proposes the fix commands:
      | true |
    And the model proposes the check "ok" running "echo checked >> \"$FIX_LOG\""
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And the repository still has README.md "# changed" and a clean working tree
