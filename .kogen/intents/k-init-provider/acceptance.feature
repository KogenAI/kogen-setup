Feature: Initialize through the selected authenticated route
  Scenario Outline: One usable route needs no unrelated account
    When provider init runs with "<route>" in mode "fresh" choosing ""
    Then provider init succeeds using "<route>"
    Examples:
      | route       |
      | chatgpt     |
      | claude-code |
      | supergrok   |
      | opencode-go |
      | anthropic   |

  Scenario: Multiple logins are not an implicit billing choice
    When provider init runs with "chatgpt,claude-code" in mode "fresh" choosing ""
    Then provider init stops for "select|choose|ambig" before sending anything

  Scenario Outline: The terminal chooser selects the route for a new project
    When provider init runs with "chatgpt,claude-code" in mode "fresh" choosing "<choice>"
    Then provider init succeeds using "<route>"
    Examples:
      | choice | route       |
      | 1      | chatgpt     |
      | 2      | claude-code |

  Scenario: Missing login does not create a manual configuration workaround
    When provider init runs with "none" in mode "fresh" choosing ""
    Then provider init stops for "login|signed in|auth" before sending anything

  Scenario: Signing into another provider does not overwrite configured roles or native bindings
    When provider init runs with "anthropic" in mode "existing" choosing ""
    Then provider init preserves the existing configuration with 1 commits

  Scenario: A valid leftover configuration is committed without rediscovery
    When provider init runs with "claude-code" in mode "leftover" choosing ""
    Then provider init preserves the existing configuration with 2 commits

  Scenario: A rejected chosen subscription never falls back to a paid key
    When provider init runs with "chatgpt" in mode "rejected" choosing ""
    Then provider init reports the rejected route without fallback
