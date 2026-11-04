Feature: k-setup-initialized-reports-bootstrap-setup: Report one-time setup in committed configuration

  Scenario: A package manager bootstrap is reported and a dependency fetch is not
    Given k-setup-initialized-reports-bootstrap-setup: a repository whose committed configuration lists the setup commands:
      """
      ["mix local.hex --force", "mix deps.get"]
      """
    When k-setup-initialized-reports-bootstrap-setup: kogen-setup runs on that repository
    Then k-setup-initialized-reports-bootstrap-setup: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Note: setup command (mix local.hex --force) looks like a one-time machine bootstrap
      Next: set commands.acceptance in .kogen/project.yaml
      Next: add the project's checks to commands.checks in .kogen/project.yaml
      """

  Scenario: A global tool install is reported
    Given k-setup-initialized-reports-bootstrap-setup: a repository whose committed configuration lists the setup commands:
      """
      ["npm install -g typescript"]
      """
    When k-setup-initialized-reports-bootstrap-setup: kogen-setup runs on that repository
    Then k-setup-initialized-reports-bootstrap-setup: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Note: setup command (npm install -g typescript) looks like a one-time machine bootstrap
      Next: set commands.acceptance in .kogen/project.yaml
      Next: add the project's checks to commands.checks in .kogen/project.yaml
      """

  Scenario: Recurring project setup alone is not reported
    Given k-setup-initialized-reports-bootstrap-setup: a repository whose committed configuration lists the setup commands:
      """
      ["go mod download"]
      """
    When k-setup-initialized-reports-bootstrap-setup: kogen-setup runs on that repository
    Then k-setup-initialized-reports-bootstrap-setup: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Next: set commands.acceptance in .kogen/project.yaml
      Next: add the project's checks to commands.checks in .kogen/project.yaml
      """

  Scenario: No setup commands report nothing
    Given k-setup-initialized-reports-bootstrap-setup: a repository whose committed configuration lists the setup commands:
      """
      []
      """
    When k-setup-initialized-reports-bootstrap-setup: kogen-setup runs on that repository
    Then k-setup-initialized-reports-bootstrap-setup: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Next: set commands.acceptance in .kogen/project.yaml
      Next: add the project's checks to commands.checks in .kogen/project.yaml
      """

  Scenario: Publish and deploy commands are reported in configured order
    Given k-setup-initialized-reports-bootstrap-setup: a repository whose committed configuration lists the setup commands:
      """
      ["go mod download", "npm publish", "terraform apply"]
      """
    When k-setup-initialized-reports-bootstrap-setup: kogen-setup runs on that repository
    Then k-setup-initialized-reports-bootstrap-setup: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Note: setup command (npm publish) looks like a one-time machine bootstrap
      Note: setup command (terraform apply) looks like a one-time machine bootstrap
      Next: set commands.acceptance in .kogen/project.yaml
      Next: add the project's checks to commands.checks in .kogen/project.yaml
      """
