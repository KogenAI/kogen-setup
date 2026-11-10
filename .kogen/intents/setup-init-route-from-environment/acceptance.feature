Feature: Select an initialization route from the environment
  This feature reproduces unattended initialization with saved provider logins.

  Scenario: Select chatgpt
    Given setup-init-route-from-environment: saved routes "chatgpt,anthropic,claude-code" and environment route "chatgpt"
    When setup-init-route-from-environment: selection runs without a terminal through "selection"
    Then setup-init-route-from-environment: route "chatgpt" is selected without prompting

  Scenario: Select claude-code
    Given setup-init-route-from-environment: saved routes "chatgpt,anthropic,claude-code" and environment route "claude-code"
    When setup-init-route-from-environment: selection runs without a terminal through "selection"
    Then setup-init-route-from-environment: route "claude-code" is selected without prompting

  Scenario: Reject unavailable route through Init
    Given setup-init-route-from-environment: saved routes "chatgpt,anthropic,claude-code" and environment route "supergrok"
    When setup-init-route-from-environment: selection runs without a terminal through "init"
    Then setup-init-route-from-environment: selection is refused with exit 4 and message containing "KOGEN_INIT_ROUTE|supergrok"

  Scenario: Refuse unattended choice without environment
    Given setup-init-route-from-environment: saved routes "chatgpt,anthropic" and environment route "unset"
    When setup-init-route-from-environment: selection runs without a terminal through "selection"
    Then setup-init-route-from-environment: selection is refused with exit 4 and message containing "select a route in a terminal before initialization|or set KOGEN_INIT_ROUTE to one of:"

  Scenario: Preserve automatic single route
    Given setup-init-route-from-environment: saved routes "chatgpt" and environment route "unset"
    When setup-init-route-from-environment: selection runs without a terminal through "selection"
    Then setup-init-route-from-environment: route "chatgpt" is selected without prompting

  Scenario: Accept matching single route
    Given setup-init-route-from-environment: saved routes "chatgpt" and environment route "chatgpt"
    When setup-init-route-from-environment: selection runs without a terminal through "selection"
    Then setup-init-route-from-environment: route "chatgpt" is selected without prompting

  Scenario: Reject different route with single login
    Given setup-init-route-from-environment: saved routes "chatgpt" and environment route "supergrok"
    When setup-init-route-from-environment: selection runs without a terminal through "selection"
    Then setup-init-route-from-environment: selection is refused with exit 4 and message containing "KOGEN_INIT_ROUTE|supergrok"
