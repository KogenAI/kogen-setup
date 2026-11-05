Feature: The init progress line reports what the shaping rounds used on the Claude Code route

  Scenario: One Claude Code round reports its usage
    When k-setup-init-claude-route-usage-reported: init runs on the "claude-code" route with rounds "valid 100/40/10"
    Then k-setup-init-claude-route-usage-reported: the scripted model answered 1 round
    And k-setup-init-claude-route-usage-reported: init succeeds
    And k-setup-init-claude-route-usage-reported: the init progress line reads "kogen: init claude-sonnet-5-5/high input=100 cached=40 output=10 reasoning=0" with its wall time

  Scenario: A corrected Claude Code round adds its usage to the first
    When k-setup-init-claude-route-usage-reported: init runs on the "claude-code" route with rounds "invalid 100/40/10, valid 50/50/5"
    Then k-setup-init-claude-route-usage-reported: the scripted model answered 2 rounds
    And k-setup-init-claude-route-usage-reported: init succeeds
    And k-setup-init-claude-route-usage-reported: the init progress line reads "kogen: init claude-sonnet-5-5/high input=150 cached=90 output=15 reasoning=0" with its wall time

  Scenario: A Claude Code round without usage reports usage=unknown
    When k-setup-init-claude-route-usage-reported: init runs on the "claude-code" route with rounds "valid none"
    Then k-setup-init-claude-route-usage-reported: the scripted model answered 1 round
    And k-setup-init-claude-route-usage-reported: init succeeds
    And k-setup-init-claude-route-usage-reported: the init progress line reads "kogen: init claude-sonnet-5-5/high usage=unknown" with its wall time
    And k-setup-init-claude-route-usage-reported: stderr does not contain "input=0"

  Scenario: One Claude Code round without usage makes the line unknown
    When k-setup-init-claude-route-usage-reported: init runs on the "claude-code" route with rounds "invalid 100/40/10, valid none"
    Then k-setup-init-claude-route-usage-reported: the scripted model answered 2 rounds
    And k-setup-init-claude-route-usage-reported: init succeeds
    And k-setup-init-claude-route-usage-reported: the init progress line reads "kogen: init claude-sonnet-5-5/high usage=unknown" with its wall time

  Scenario: Two invalid Claude Code rounds print the usage line before the init_invalid error
    When k-setup-init-claude-route-usage-reported: init runs on the "claude-code" route with rounds "invalid 100/40/10, invalid 50/50/5"
    Then k-setup-init-claude-route-usage-reported: the scripted model answered 2 rounds
    And k-setup-init-claude-route-usage-reported: init stops with exit 4 and the init_invalid error after the progress line "kogen: init claude-sonnet-5-5/high input=150 cached=90 output=15 reasoning=0"

  Scenario: Two invalid direct-route answers print the usage line before the init_invalid error
    When k-setup-init-claude-route-usage-reported: init runs on the "chatgpt" route with rounds "invalid 100/0/20/5, invalid 30/10/6/2"
    Then k-setup-init-claude-route-usage-reported: the scripted model answered 2 rounds
    And k-setup-init-claude-route-usage-reported: init stops with exit 4 and the init_invalid error after the progress line "kogen: init gpt-6.1-sol/high input=130 cached=10 output=26 reasoning=7"

  Scenario: The direct route's line is unchanged
    When k-setup-init-claude-route-usage-reported: init runs on the "chatgpt" route with rounds "valid 100/0/20/5"
    Then k-setup-init-claude-route-usage-reported: the scripted model answered 1 round
    And k-setup-init-claude-route-usage-reported: init succeeds
    And k-setup-init-claude-route-usage-reported: the init progress line reads "kogen: init gpt-6.1-sol/high input=100 cached=0 output=20 reasoning=5" with its wall time

  Scenario: The direct route still sums both attempts
    When k-setup-init-claude-route-usage-reported: init runs on the "chatgpt" route with rounds "invalid 100/0/20/5, valid 30/10/6/2"
    Then k-setup-init-claude-route-usage-reported: the scripted model answered 2 rounds
    And k-setup-init-claude-route-usage-reported: init succeeds
    And k-setup-init-claude-route-usage-reported: the init progress line reads "kogen: init gpt-6.1-sol/high input=130 cached=10 output=26 reasoning=7" with its wall time
