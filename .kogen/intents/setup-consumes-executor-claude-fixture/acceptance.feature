Feature: setup-consumes-executor-claude-fixture: Setup's Executor consumer test uses the signed Executor fixture
  This feature checks that Setup resolves the signed Executor main revision that provides the shared fake Claude runtime, that its Executor consumer test installs that fixture instead of a runtime program of its own, that the consumer contract on arguments and token stays asserted, and that a malformed fixture response still fails the test.

  Scenario: The signed Executor main revision is resolved through the normal dependency path
    Then setup-consumes-executor-claude-fixture: the module graph resolves "github.com/KogenAI/kogen-executor" at version "v0.0.0-20261109224447-6396bc976408"
    And setup-consumes-executor-claude-fixture: the resolved Executor module provides the fixture accessors Args and Token
    And setup-consumes-executor-claude-fixture: the module graph builds with readonly modules

  Scenario: The other producer pins and the independent lane stay as they are
    Then setup-consumes-executor-claude-fixture: the module graph resolves "github.com/KogenAI/kogen-coordinator" at version "v0.0.0-20261106110407-d74daae36f56"
    And setup-consumes-executor-claude-fixture: the module graph resolves "github.com/KogenAI/kogen-loop" at version "v0.0.0-20261104031734-708a69af07b8"
    And setup-consumes-executor-claude-fixture: the module graph resolves "github.com/KogenAI/kogen-verification" at version "v0.0.0-20261104033953-b7d89bf3b513"
    And setup-consumes-executor-claude-fixture: go.mod requires only the Kogen modules coordinator, executor, loop and verification and replaces nothing

  Scenario: Setup's own sources and the other consumer suites are untouched
    Then setup-consumes-executor-claude-fixture: the sources of the CLI, the contract suite, Setup and the other consumer suites are unchanged with digest "dac5bca684694b38059cf322aee8a627fe2cde6ac85486773b1fa68fa75104ec"

  Scenario: The Executor consumer test installs the fixture and drops the duplicate runtime
    Then setup-consumes-executor-claude-fixture: the Executor consumer test installs the signed fixture and reads Args and Token from it
    And setup-consumes-executor-claude-fixture: the Executor consumer test no longer carries its own fake Claude program

  Scenario: Setup's consumer contract stays in the Executor consumer test
    Then setup-consumes-executor-claude-fixture: the Executor consumer test still names "TestClaudeRounds"
    And setup-consumes-executor-claude-fixture: the Executor consumer test still names "TestHookAndToolDefinitions"
    And setup-consumes-executor-claude-fixture: the Executor consumer test still names "--model"
    And setup-consumes-executor-claude-fixture: the Executor consumer test still names "--effort"
    And setup-consumes-executor-claude-fixture: the Executor consumer test still names "--json-schema"
    And setup-consumes-executor-claude-fixture: the Executor consumer test still names "fake-token"
    And setup-consumes-executor-claude-fixture: the Executor consumer test still names "invalid: retry"

  Scenario: The focused Executor consumer tests pass
    Then setup-consumes-executor-claude-fixture: the focused Executor consumer tests TestClaudeRounds and TestHookAndToolDefinitions pass

  Scenario Outline: Every consumer suite passes
    Then setup-consumes-executor-claude-fixture: go test succeeds for "<package>"

    Examples:
      | package                           |
      | ./consumes/kogen-coordinator/...  |
      | ./consumes/kogen-executor/...     |
      | ./consumes/kogen-loop/...         |
      | ./consumes/kogen-verification/... |

  Scenario: A structured output that is not an object fails the test
    Then setup-consumes-executor-claude-fixture: TestClaudeRounds fails when the fixture runtime changes so that "every round answers a structured output that is not an object"

  Scenario: A structured output with other content fails the test
    Then setup-consumes-executor-claude-fixture: TestClaudeRounds fails when the fixture runtime changes so that "every round answers a structured output with other content"

  Scenario: A round without a result line fails the test
    Then setup-consumes-executor-claude-fixture: TestClaudeRounds fails when the fixture runtime changes so that "every round answers no result line"

  Scenario: A malformed second round fails the test
    Then setup-consumes-executor-claude-fixture: TestClaudeRounds fails when the fixture runtime changes so that "the second round answers a structured output that is not an object"

  Scenario: A runtime without the model argument fails the test
    Then setup-consumes-executor-claude-fixture: TestClaudeRounds fails when the fixture runtime changes so that "the arguments omit --model"

  Scenario: A runtime without the effort argument fails the test
    Then setup-consumes-executor-claude-fixture: TestClaudeRounds fails when the fixture runtime changes so that "the arguments omit --effort"

  Scenario: A runtime without the schema argument fails the test
    Then setup-consumes-executor-claude-fixture: TestClaudeRounds fails when the fixture runtime changes so that "the arguments omit --json-schema"

  Scenario: A token with other bytes on file descriptor 3 fails the test
    Then setup-consumes-executor-claude-fixture: TestClaudeRounds fails when the fixture runtime changes so that "the token read from file descriptor 3 has other bytes"

  Scenario: A runtime that receives no token fails the test
    Then setup-consumes-executor-claude-fixture: TestClaudeRounds fails when the fixture runtime changes so that "no token is read from file descriptor 3"

  Scenario: A retry round whose prompt lacks the feedback fails the test
    Then setup-consumes-executor-claude-fixture: TestClaudeRounds fails when the fixture runtime changes so that "the second round prompt lacks the retry feedback"

  Scenario: Another reported Claude Code version fails the test
    Then setup-consumes-executor-claude-fixture: TestClaudeRounds fails when the fixture runtime changes so that "the runtime reports another Claude Code version"
