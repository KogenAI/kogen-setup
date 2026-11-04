Feature: k-setup-initialized-reports-vacuous-checks: Report checks that cannot fail in committed configuration

  Scenario: A check that only prints is reported as running nothing
    Given k-setup-initialized-reports-vacuous-checks: a repository whose committed configuration is:
      """
      {"setup": [], "checks": [{"name": "test", "run": "echo ok"}]}
      """
    When k-setup-initialized-reports-vacuous-checks: kogen-setup runs on that repository
    Then k-setup-initialized-reports-vacuous-checks: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Note: check test (echo ok) cannot fail: runs nothing
      Next: set commands.acceptance in .kogen/project.yaml
      """

  Scenario: A check ending in || true is reported as masking its failure
    Given k-setup-initialized-reports-vacuous-checks: a repository whose committed configuration is:
      """
      {"setup": [], "checks": [{"name": "test", "run": "go test ./... || true"}]}
      """
    When k-setup-initialized-reports-vacuous-checks: kogen-setup runs on that repository
    Then k-setup-initialized-reports-vacuous-checks: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Note: check test (go test ./... || true) cannot fail: masks its failure
      Next: set commands.acceptance in .kogen/project.yaml
      """

  Scenario: A real check is not reported
    Given k-setup-initialized-reports-vacuous-checks: a repository whose committed configuration is:
      """
      {"setup": [], "checks": [{"name": "test", "run": "go test ./..."}]}
      """
    When k-setup-initialized-reports-vacuous-checks: kogen-setup runs on that repository
    Then k-setup-initialized-reports-vacuous-checks: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Next: set commands.acceptance in .kogen/project.yaml
      """

  Scenario: Two flagged checks are reported in configuration order and none is run
    Given k-setup-initialized-reports-vacuous-checks: a repository whose committed configuration is:
      """
      {"setup": [], "checks": [{"name": "lint", "run": "touch check-ran || true"}, {"name": "unit", "run": "go test ./..."}, {"name": "smoke", "run": "echo ok"}]}
      """
    When k-setup-initialized-reports-vacuous-checks: kogen-setup runs on that repository
    Then k-setup-initialized-reports-vacuous-checks: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Note: check lint (touch check-ran || true) cannot fail: masks its failure
      Note: check smoke (echo ok) cannot fail: runs nothing
      Next: set commands.acceptance in .kogen/project.yaml
      """

  Scenario: A check matching both predicates prints one runs-nothing line
    Given k-setup-initialized-reports-vacuous-checks: a repository whose committed configuration is:
      """
      {"setup": [], "checks": [{"name": "test", "run": "echo ok || true"}]}
      """
    When k-setup-initialized-reports-vacuous-checks: kogen-setup runs on that repository
    Then k-setup-initialized-reports-vacuous-checks: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Note: check test (echo ok || true) cannot fail: runs nothing
      Next: set commands.acceptance in .kogen/project.yaml
      """

  Scenario: Check notes follow the setup notes
    Given k-setup-initialized-reports-vacuous-checks: a repository whose committed configuration is:
      """
      {"setup": ["mix local.hex --force"], "checks": [{"name": "test", "run": "echo ok"}]}
      """
    When k-setup-initialized-reports-vacuous-checks: kogen-setup runs on that repository
    Then k-setup-initialized-reports-vacuous-checks: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Note: setup command (mix local.hex --force) looks like a one-time machine bootstrap
      Note: check test (echo ok) cannot fail: runs nothing
      Next: set commands.acceptance in .kogen/project.yaml
      """
