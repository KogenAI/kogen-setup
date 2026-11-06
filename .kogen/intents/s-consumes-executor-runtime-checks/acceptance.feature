Feature: Stand-ins for Kogen's Claude Code runtime pass with and without the executor's runtime checks

  Scenario: TestClaudeRounds passes against the pinned kogen-executor and against its runtime checks
    When s-consumes-executor-runtime-checks: TestClaudeRounds runs against the pinned kogen-executor and against it with the runtime checks
    Then s-consumes-executor-runtime-checks: TestClaudeRounds passes against the pinned kogen-executor
    And s-consumes-executor-runtime-checks: TestClaudeRounds passes against the kogen-executor with the runtime checks
    And s-consumes-executor-runtime-checks: go.mod requires "github.com/KogenAI/kogen-executor v0.0.0-20261104032156-49f915c19779"
    And s-consumes-executor-runtime-checks: go.sum lists "github.com/KogenAI/kogen-executor v0.0.0-20261104032156-49f915c19779 h1:59PPxNfvEgT+iLw5qxPSbTMwYXoN4WU1YQWrwoJEUKw="
    And s-consumes-executor-runtime-checks: go.sum lists "github.com/KogenAI/kogen-executor v0.0.0-20261104032156-49f915c19779/go.mod h1:qjm/u2kVwQdMxIPTbNdExSqanEcPs8UpBUFldsotEDg="

  Scenario: The Claude Code route usage feature passes against the pinned kogen-executor and against its runtime checks
    When s-consumes-executor-runtime-checks: the Claude Code route usage feature runs against the pinned kogen-executor and against it with the runtime checks
    Then s-consumes-executor-runtime-checks: the Claude Code route usage feature passes against the pinned kogen-executor
    And s-consumes-executor-runtime-checks: the Claude Code route usage feature passes against the kogen-executor with the runtime checks
