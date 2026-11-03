Feature: Show failed fixer output during init
  Scenario: Failing fixer explains itself before the passing fixer runs
    Given the model proposes the fix commands:
      | echo boom-fix >&2; exit 5 |
      | true |
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And stdout is:
      """
      Initialized Kogen in {repo}
      Setup: none
      Checks: none passed
      Left out: fix-1 (echo boom-fix >&2; exit 5) failed with status 5
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha8} Add Kogen configuration
      Next: add the project's checks to commands.checks in .kogen/project.yaml
      """
    And project.yaml lists the fix commands:
      | true |
    And fixer diagnostic blocks are:
      """
      [{"progress":"kogen: running fix-1: echo boom-fix >&2; exit 5","lines":["boom-fix"]},{"progress":"kogen: running fix-2: true","lines":[]}]
      """

  Scenario: Long failed output is bounded by the existing renderer
    Given the model proposes the fix commands:
      | i=1; while [ "$i" -le 500 ]; do printf "%s:" "$i"; printf "%0205d\\n" 0; i=$((i+1)); done; exit 9 |
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And the failed fixer 'i=1; while [ "$i" -le 500 ]; do printf "%s:" "$i"; printf "%0205d\n" 0; i=$((i+1)); done; exit 9' retains only lines 481 through 500 with width 200 from 205 zeroes
    And project.yaml lists no fix command

  Scenario: Successful noisy fixer stays silent
    Given the model proposes the fix commands:
      | echo successful-output; echo successful-error >&2; exit 0 |
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And stderr has no line starting with "  | "
    And stdout has no "Left out:" line
    And project.yaml lists the fix commands:
      | echo successful-output; echo successful-error >&2; exit 0 |
