Feature: Standalone setup command keeps its JSON contract on argument-count errors
  This feature covers cmd/kogen-setup invoked with a wrong number of arguments and with one valid checkout.

  Scenario: No checkout argument
    Given standalone-cli-json-usage-errors: the standalone setup command is built
    When standalone-cli-json-usage-errors: I run the command with no arguments
    Then standalone-cli-json-usage-errors: stdout is one JSON object with exit 2, null configuration and the usage message as error
    And standalone-cli-json-usage-errors: stderr is exactly the usage message line
    And standalone-cli-json-usage-errors: the process exit code is 2

  Scenario: Too many arguments
    Given standalone-cli-json-usage-errors: the standalone setup command is built
    When standalone-cli-json-usage-errors: I run the command with two checkout arguments
    Then standalone-cli-json-usage-errors: stdout is one JSON object with exit 2, null configuration and the usage message as error
    And standalone-cli-json-usage-errors: stderr is exactly the usage message line
    And standalone-cli-json-usage-errors: the process exit code is 2

  Scenario: One valid checkout argument keeps the Init result
    Given standalone-cli-json-usage-errors: the standalone setup command is built
    And standalone-cli-json-usage-errors: an empty Git checkout with local identity
    When standalone-cli-json-usage-errors: I run the command with the checkout as its only argument
    Then standalone-cli-json-usage-errors: stdout is one JSON object with exit 0, the written configuration and null error
    And standalone-cli-json-usage-errors: neither stream holds the usage message
    And standalone-cli-json-usage-errors: the process exit code is 0
