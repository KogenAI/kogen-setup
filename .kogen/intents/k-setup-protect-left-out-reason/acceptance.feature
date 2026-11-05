Feature: Init reports why a protect path was left out after verification

  Scenario: Kept protect path has no left-out entry
    When k-setup-protect-left-out-reason: Init runs with the test script exiting 0 and this proposal:
      """
      {"setup":[],"fix":[],"checks":[{"name":"t","run":"npm test"}],"protect":["package.json"]}
      """
    Then k-setup-protect-left-out-reason: Init exits 0 and prints:
      """
      Initialized Kogen in {repo}
      Setup: none
      Fix: none
      Checks: test, t
      Protect: package.json
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha8} Add Kogen configuration
      """
    And k-setup-protect-left-out-reason: the committed protect list is:
      """
      ["package.json"]
      """

  Scenario: A protect path dropped after verification is reported with its reason
    When k-setup-protect-left-out-reason: Init runs with the test script exiting 1 and this proposal:
      """
      {"setup":[],"fix":[],"checks":[{"name":"t","run":"npm test"},{"name":"u","run":"test -f package.json"}],"protect":["package.json"]}
      """
    Then k-setup-protect-left-out-reason: Init exits 0 and prints:
      """
      Initialized Kogen in {repo}
      Setup: none
      Fix: none
      Checks: u
      Protect: none
      Left out: test (npm run test) failed with status 1; t (npm test) failed with status 1; protect package.json: npm package and dependency metadata is editable; verification definitions or embedded settings can be protected as a whole
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha8} Add Kogen configuration
      """
    And k-setup-protect-left-out-reason: the committed protect list is:
      """
      []
      """

  Scenario: All checks fail
    When k-setup-protect-left-out-reason: Init runs with the test script exiting 1 and this proposal:
      """
      {"setup":[],"fix":[],"checks":[{"name":"t","run":"npm test"}],"protect":["package.json"]}
      """
    Then k-setup-protect-left-out-reason: Init exits 0 and prints:
      """
      Initialized Kogen in {repo}
      Setup: none
      Fix: none
      Checks: none passed
      Protect: none
      Left out: test (npm run test) failed with status 1; t (npm test) failed with status 1
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha8} Add Kogen configuration
      Next: add the project's checks to commands.checks in .kogen/project.yaml
      """
    And k-setup-protect-left-out-reason: the committed protect list is:
      """
      []
      """
