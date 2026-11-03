Feature: Standalone setup developer entry point
  Scenario: Configure and report an empty checkout without Kogen
    Given a standalone setup checkout with local Git identity
    When I run the standalone setup command
    Then the standalone result has exit 0 and a written configuration
    And the standalone checkout has 1 commit
    When I run the standalone setup command
    Then the standalone result has exit 0 and a written configuration
    And the standalone checkout has 1 commit

  Scenario: Preserve the missing identity failure
    Given a standalone setup checkout without Git identity
    When I run the standalone setup command
    Then the standalone result has exit 3 and no configuration
    And the standalone checkout has 0 commits
