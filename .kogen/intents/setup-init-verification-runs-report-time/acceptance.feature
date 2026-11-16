Feature: Init verification runs report their elapsed time and result
  This feature runs kogen init through its real entry point on a synthetic repository with a fake mix program and checks the progress lines on stderr.

  Scenario: Setup commands report both runs
    When setup-init-verification-runs-report-time: init runs with the proposal:
      """
      {"setup":["mix deps.get"],"fix":[],"checks":[]}
      """
    Then setup-init-verification-runs-report-time: the progress lines appear in this order:
      """
      kogen: running setup-1: mix deps.get
      kogen: setup-1 finished in 0s (status 0)
      kogen: running setup-1 again: mix deps.get
      kogen: setup-1 again finished in 0s (status 0)
      """

  Scenario: A passing and a failing check report their own status
    When setup-init-verification-runs-report-time: init runs with the proposal:
      """
      {"setup":[],"fix":[],"checks":[["test","mix test"],["compile","mix compile --warnings-as-errors"]]}
      """
    Then setup-init-verification-runs-report-time: the progress lines appear in this order:
      """
      kogen: test finished in 0s (status 0)
      kogen: test again finished in 0s (status 0)
      kogen: compile finished in 0s (status 1)
      """
    And setup-init-verification-runs-report-time: no progress line starts with "kogen: compile again finished"

  Scenario: A fixer and the kept checks it is verified against report their end lines
    When setup-init-verification-runs-report-time: init runs with the proposal:
      """
      {"setup":[],"fix":["mix format"],"checks":[["test","mix test"]]}
      """
    Then setup-init-verification-runs-report-time: the progress lines appear in this order:
      """
      kogen: fix-1 finished in 0s (status 0)
      kogen: fix-1 again finished in 0s (status 0)
      kogen: test after fix-1 finished in 0s (status 0)
      """

  Scenario: A timed-out command reports the timeout and not a status
    When setup-init-verification-runs-report-time: init runs with the proposal:
      """
      {"setup":[],"fix":[],"checks":[["slow","sleep 30"]],"budget":true}
      """
    Then setup-init-verification-runs-report-time: a progress line matches "^kogen: slow timed out after [0-9]+s$"
    And setup-init-verification-runs-report-time: no progress line starts with "kogen: slow finished"

  Scenario: The budget line lists the longest runs, longest first
    When setup-init-verification-runs-report-time: the budget line is built for:
      """
      {"runs":[{"Label":"setup-1","Seconds":2},{"Label":"slow","Seconds":7},{"Label":"test","Seconds":1},{"Label":"fix-1","Seconds":7}],"Budget":"30m"}
      """
    Then setup-init-verification-runs-report-time: the budget line is "kogen: init time budget of 30m used up; longest runs: slow 7s, fix-1 7s, setup-1 2s"

  Scenario: A budget stop prints the budget line once
    When setup-init-verification-runs-report-time: init runs with the proposal:
      """
      {"setup":[],"fix":[],"checks":[["slow","sleep 30"],["test","mix test"]],"budget":true}
      """
    Then setup-init-verification-runs-report-time: exactly one progress line starts with "kogen: init time budget of 3s used up; longest runs: slow " and it follows a line starting with "kogen: slow timed out after"
