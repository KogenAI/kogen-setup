Feature: Bound init verification with one total time budget
  Init verifies setup, checks and fixes within one time budget measured from the start of
  verification. Each scenario lowers the budget (30 minutes in production) to a few seconds and
  the per-command limit (10 minutes) to 10 seconds. Commands write to $RUN_LOG, outside the
  project copy, so RUN_LOG shows which commands were started.

  Scenario: A spent budget stops the slow check and leaves later commands unstarted
    When k-setup-verify-total-budget: init verifies with a 2 second budget and the model proposes:
      """
      {"setup":["echo setup >> \"$RUN_LOG\""],"checks":[{"name":"slow","run":"sleep 30"},{"name":"later-a","run":"echo later-a >> \"$RUN_LOG\""},{"name":"later-b","run":"echo later-b >> \"$RUN_LOG\""}],"fix":["echo fix >> \"$RUN_LOG\""],"delayMs":0}
      """
    Then k-setup-verify-total-budget: the outcome is:
      """
      {"setup":["echo setup >> \"$RUN_LOG\""],"checks":[],"fix":[],"runLog":"setup\nsetup\n","minVerifyMs":1900,"maxVerifyMs":6000,"maxElapsedMs":6000}
      """
    And k-setup-verify-total-budget: stdout is:
      """
      Initialized Kogen in {repo}
      Setup: echo setup >> "$RUN_LOG"
      Checks: none passed
      Left out: slow (sleep 30) timed out: init time budget of 2s used up; later-a (echo later-a >> "$RUN_LOG") not verified: init time budget of 2s used up; later-b (echo later-b >> "$RUN_LOG") not verified: init time budget of 2s used up; fix-1 (echo fix >> "$RUN_LOG") not verified: init time budget of 2s used up
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha} Add Kogen configuration
      Next: add the project's checks to commands.checks in .kogen/project.yaml
      """

  Scenario: Within a 60 second budget only the per-command limit leaves the slow check out
    When k-setup-verify-total-budget: init verifies with a 60 second budget and the model proposes:
      """
      {"setup":["echo setup >> \"$RUN_LOG\""],"checks":[{"name":"slow","run":"sleep 30"},{"name":"later-a","run":"echo later-a >> \"$RUN_LOG\""},{"name":"later-b","run":"echo later-b >> \"$RUN_LOG\""}],"fix":["echo fix >> \"$RUN_LOG\""],"delayMs":0}
      """
    Then k-setup-verify-total-budget: the outcome is:
      """
      {"setup":["echo setup >> \"$RUN_LOG\""],"checks":["later-a","later-b"],"fix":["echo fix >> \"$RUN_LOG\""],"runLog":"setup\nsetup\nlater-a\nlater-a\nlater-b\nlater-b\nfix\n","minVerifyMs":9900,"maxVerifyMs":30000,"maxElapsedMs":30000}
      """
    And k-setup-verify-total-budget: stdout is:
      """
      Initialized Kogen in {repo}
      Setup: echo setup >> "$RUN_LOG"
      Checks: later-a, later-b
      Left out: slow (sleep 30) timed out after 10s
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha} Add Kogen configuration
      """

  Scenario: The model conversation does not use up the budget
    When k-setup-verify-total-budget: init verifies with a 2 second budget and the model proposes:
      """
      {"setup":["echo setup >> \"$RUN_LOG\""],"checks":[{"name":"slow","run":"sleep 30"},{"name":"later-a","run":"echo later-a >> \"$RUN_LOG\""},{"name":"later-b","run":"echo later-b >> \"$RUN_LOG\""}],"fix":["echo fix >> \"$RUN_LOG\""],"delayMs":2500}
      """
    Then k-setup-verify-total-budget: the outcome is:
      """
      {"setup":["echo setup >> \"$RUN_LOG\""],"checks":[],"fix":[],"runLog":"setup\nsetup\n","minVerifyMs":1900,"maxVerifyMs":6000,"minElapsedMs":2500,"maxElapsedMs":8500}
      """
    And k-setup-verify-total-budget: stdout is:
      """
      Initialized Kogen in {repo}
      Setup: echo setup >> "$RUN_LOG"
      Checks: none passed
      Left out: slow (sleep 30) timed out: init time budget of 2s used up; later-a (echo later-a >> "$RUN_LOG") not verified: init time budget of 2s used up; later-b (echo later-b >> "$RUN_LOG") not verified: init time budget of 2s used up; fix-1 (echo fix >> "$RUN_LOG") not verified: init time budget of 2s used up
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha} Add Kogen configuration
      Next: add the project's checks to commands.checks in .kogen/project.yaml
      """

  Scenario: A budget spent during setup leaves the later setup entry, checks and fixes unstarted
    When k-setup-verify-total-budget: init verifies with a 2 second budget and the model proposes:
      """
      {"setup":["sleep 30","echo setup >> \"$RUN_LOG\""],"checks":[{"name":"later-a","run":"echo later-a >> \"$RUN_LOG\""}],"fix":["echo fix >> \"$RUN_LOG\""],"delayMs":0}
      """
    Then k-setup-verify-total-budget: the outcome is:
      """
      {"setup":[],"checks":[],"fix":[],"runLog":null,"minVerifyMs":1900,"maxVerifyMs":6000,"maxElapsedMs":6000}
      """
    And k-setup-verify-total-budget: stdout is:
      """
      Initialized Kogen in {repo}
      Setup: none
      Checks: none passed
      Left out: setup-1 (sleep 30) timed out: init time budget of 2s used up; setup-2 (echo setup >> "$RUN_LOG") not verified: init time budget of 2s used up; later-a (echo later-a >> "$RUN_LOG") not verified: init time budget of 2s used up; fix-1 (echo fix >> "$RUN_LOG") not verified: init time budget of 2s used up
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha} Add Kogen configuration
      Next: add the project's checks to commands.checks in .kogen/project.yaml
      """
