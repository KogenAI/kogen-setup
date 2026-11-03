Feature: Observer control (known good): the acceptance steps accept init's real output

  Every expectation here holds before and after the fix commands are verified: "true" exits 0,
  and the fix log is written by a check, not by a fixer.

  Scenario: A kept fixer, a failing check and a check that writes the fix log
    Given the model proposes the fix commands:
      | true |
    And the model proposes the check "ok" running "echo checked >> \"$FIX_LOG\""
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And the "Left out:" line contains "bad (exit 7) failed with status 7"
    And the "Left out:" line does not contain "fix-"
    And stdout is:
      """
      Initialized Kogen in {repo}
      Setup: none
      Checks: ok
      Left out: bad (exit 7) failed with status 7
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha8} Add Kogen configuration
      """
    And project.yaml lists the fix commands:
      | true |
    And project.yaml lists the checks:
      | ok |
    And stderr contains the line "kogen: checking bad: exit 7"
    And stderr has the line "kogen: checking the acceptance runner" before the line "kogen: checking bad: exit 7"
    And stderr has no line starting with "kogen: running setup-"
    And the fix commands wrote to the fix log, in order:
      | checked |
    And the repository still has README.md "# notes" and a clean working tree

  Scenario: No fixer
    Given the model proposes no fix command
    And the model proposes the check "ok" running "true"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And stdout has no "Left out:" line
    And project.yaml lists no fix command
    And project.yaml contains the line "  fix: []            # deterministic fixers, run once after each builder round"
