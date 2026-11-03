Feature: kogen init runs the proposed fix commands on the copy and leaves out the failing ones

  Init runs each fix command once on the copy of the committed tree, after the checks. A fix
  that exits non-zero is left out with "fix-<n> (<command>) failed with status <code>"; a fix
  that exits 0 is kept. The repository is the synthetic fixture: README.md ("# notes") only.

  Scenario: A failing fixer is left out and a passing one is kept
    Given the model proposes the fix commands:
      | true   |
      | exit 3 |
    And the model proposes the check "ok" running "true"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And the "Left out:" line contains "fix-2 (exit 3) failed with status 3"
    And the "Left out:" line does not contain "fix-1"
    And stdout is:
      """
      Initialized Kogen in {repo}
      Setup: none
      Checks: ok
      Left out: fix-2 (exit 3) failed with status 3
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha8} Add Kogen configuration
      """
    And project.yaml lists the fix commands:
      | true |
    And project.yaml lists the checks:
      | ok |
    And stderr contains the line "kogen: running fix-1: true"
    And stderr has the line "kogen: checking ok: true" before the line "kogen: running fix-1: true"
    And stderr has the line "kogen: running fix-1: true" before the line "kogen: running fix-2: exit 3"

  Scenario: Fixers run once, last, on the copy: a fixer that rewrites a tracked file does not change which checks are kept
    Given the model proposes the fix commands:
      | echo rewritten > README.md && echo rewrote >> "$FIX_LOG"                                          |
      | echo run >> runs.txt && test ! -e .git && test -n "$KOGEN_NODE" && echo appended >> "$FIX_LOG" |
    And the model proposes the check "same" running "grep -qx '# notes' README.md"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And stdout is:
      """
      Initialized Kogen in {repo}
      Setup: none
      Checks: same
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha8} Add Kogen configuration
      """
    And project.yaml lists the fix commands:
      | echo rewritten > README.md && echo rewrote >> "$FIX_LOG"                                          |
      | echo run >> runs.txt && test ! -e .git && test -n "$KOGEN_NODE" && echo appended >> "$FIX_LOG" |
    And project.yaml lists the checks:
      | same |
    And the fix commands wrote to the fix log, in order:
      | rewrote  |
      | appended |
    And the repository still has README.md "# notes" and a clean working tree

  Scenario: Left-out fixers follow the left-out checks, and a project whose only fixer fails keeps none
    Given the model proposes the fix commands:
      | exit 5 |
    And the model proposes the check "bad" running "exit 7"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And stdout is:
      """
      Initialized Kogen in {repo}
      Setup: none
      Checks: none passed
      Left out: bad (exit 7) failed with status 7; fix-1 (exit 5) failed with status 5
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha8} Add Kogen configuration
      Next: add the project's checks to commands.checks in .kogen/project.yaml
      """
    And project.yaml lists no fix command
    And project.yaml contains the line "  fix: []            # deterministic fixers, run once after each builder round"

  Scenario: Without a proposed fixer the output is what it is today
    Given the model proposes no fix command
    And the model proposes the check "ok" running "true"
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
    And stdout has no "Left out:" line
    And project.yaml lists no fix command
    And project.yaml contains the line "  fix: []            # deterministic fixers, run once after each builder round"
    And stderr has no line starting with "kogen: running fix-"
