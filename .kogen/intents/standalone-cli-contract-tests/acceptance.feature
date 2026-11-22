Feature: Standalone setup command contract tests
  This feature runs the command's own Go tests against the real command and against
  wrong commands, so a test that checks too little is rejected.

  Scenario: The tests accept the real command
    When standalone-cli-contract-tests: the cmd/kogen-setup tests run against the unchanged command
    Then standalone-cli-contract-tests: the tests pass and at least 3 of them ran

  Scenario: The tests reject usage written to stdout
    When standalone-cli-contract-tests: the cmd/kogen-setup tests run against a command with usage on stdout
    Then standalone-cli-contract-tests: a test fails

  Scenario: The tests reject a configuration that differs from the written file
    When standalone-cli-contract-tests: the cmd/kogen-setup tests run against a command with configuration content altered
    Then standalone-cli-contract-tests: a test fails

  Scenario: The tests reject Init's human output on stdout
    When standalone-cli-contract-tests: the cmd/kogen-setup tests run against a command with human output on stdout
    Then standalone-cli-contract-tests: a test fails

  Scenario: The tests reject a diagnostic on stdout
    When standalone-cli-contract-tests: the cmd/kogen-setup tests run against a command with diagnostic on stdout
    Then standalone-cli-contract-tests: a test fails

  Scenario: The tests reject a failure without an error
    When standalone-cli-contract-tests: the cmd/kogen-setup tests run against a command with error dropped
    Then standalone-cli-contract-tests: a test fails
