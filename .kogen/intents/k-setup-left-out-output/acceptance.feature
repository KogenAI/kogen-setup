Feature: Diagnostic tails for left-out commands
  Scenario: Setup and check failures preserve their reasons
    When init verifies the proposal:
      """
      {"setup":["echo boom-setup >&2; exit 4"],"fix":[],"checks":[{"name":"bad","run":"echo boom-check; exit 7"},{"name":"good","run":"true"}],"protect":[]}
      """
    Then the left-out output is:
      """
      {"leftOut":"Left out: setup-1 (echo boom-setup >&2; exit 4) failed with status 4; bad (echo boom-check; exit 7) failed with status 7","blocks":[{"progress":"kogen: running setup-1: echo boom-setup >&2; exit 4","lines":["boom-setup"]},{"progress":"kogen: checking bad: echo boom-check; exit 7","lines":["boom-check"]}]}
      """

  Scenario: Second-run failure reports only the second output
    When init verifies the proposal:
      """
      {"setup":["if [ -f seeded ]; then echo second; exit 8; else touch seeded; echo first; fi"],"fix":[],"checks":[{"name":"good","run":"echo passing"}],"protect":[]}
      """
    Then the left-out output is:
      """
      {"leftOut":"Left out: setup-1 (if [ -f seeded ]; then echo second; exit 8; else touch seeded; echo first; fi) is not repeatable: its second run failed with status 8","blocks":[{"progress":"kogen: running setup-1 again: if [ -f seeded ]; then echo second; exit 8; else touch seeded; echo first; fi","lines":["second"]}]}
      """

  Scenario: Second-run tree change reports second output
    When init verifies the proposal:
      """
      {"setup":["echo run >> runs.txt; echo changed"],"fix":[],"checks":[],"protect":[]}
      """
    Then the left-out output is:
      """
      {"leftOut":"Left out: setup-1 (echo run >> runs.txt; echo changed) is not repeatable: its second run changed runs.txt","blocks":[{"progress":"kogen: running setup-1 again: echo run >> runs.txt; echo changed","lines":["changed"]}]}
      """

  Scenario: Bound long command output
    When init verifies the proposal:
      """
      {"setup":[],"fix":[],"checks":[{"name":"long","run":"i=1; while [ \"$i\" -le 500 ]; do printf \"%s:\" \"$i\"; printf \"%0205d\\n\" 0; i=$((i+1)); done; exit 9"}],"protect":[]}
      """
    Then the long check retains lines 481 through 500 at width 200
