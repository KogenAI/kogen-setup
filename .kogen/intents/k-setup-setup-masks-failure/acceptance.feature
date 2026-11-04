Feature: Refuse setup failure masking
  Scenario Outline: Reject literal tails
    When k-setup-setup-masks-failure: Validate "setup" command "<command>"
    Then k-setup-setup-masks-failure: problems are '<problems>' and zero proposal is true
    Examples:
      | command | problems |
      | bundle install; true | ["setup command bundle install; true ignores its own failure"] |
      | npm ci; : | ["setup command npm ci; : ignores its own failure"] |
      | npm ci; exit 0 | ["setup command npm ci; exit 0 ignores its own failure"] |
      | npm ci & | ["setup command npm ci & ignores its own failure"] |
  Scenario: Reject npm success recovery
    When k-setup-setup-masks-failure: Validate "setup" command "npm ci || true"
    Then k-setup-setup-masks-failure: problems are '["setup command npm ci || true ignores its own failure"]' and zero proposal is true
  Scenario: Reject colon recovery
    When k-setup-setup-masks-failure: Validate "setup" command "npm ci || :"
    Then k-setup-setup-masks-failure: problems are '["setup command npm ci || : ignores its own failure"]' and zero proposal is true
  Scenario: Reject exit recovery
    When k-setup-setup-masks-failure: Validate "setup" command "npm ci || exit 0"
    Then k-setup-setup-masks-failure: problems are '["setup command npm ci || exit 0 ignores its own failure"]' and zero proposal is true
  Scenario Outline: Preserve ordinary setup and blocks
    When k-setup-setup-masks-failure: Validate "setup" command "<command>"
    Then k-setup-setup-masks-failure: problems are '[]' and zero proposal is false
    Examples:
      | command |
      | npm ci |
      | if false; then true; fi |
      | case x in x) true;; esac |
      | sleep 1 & wait |
  Scenario: Accept real recovery
    When k-setup-setup-masks-failure: Validate "setup" command "npm ci || (cat log; exit 1)"
    Then k-setup-setup-masks-failure: problems are '[]' and zero proposal is false
  Scenario: Quoted text has no mask problem but retains echo refusal
    When k-setup-setup-masks-failure: Validate "setup" command "echo 'a || true'"
    Then k-setup-setup-masks-failure: problems are "[\"setup command echo 'a || true' runs nothing\"]" and zero proposal is true
  Scenario: Preserve check rejection
    When k-setup-setup-masks-failure: Validate "checks" command "npm ci || true"
    Then k-setup-setup-masks-failure: problems are '["check test (npm ci || true) installs dependencies; put the install in setup","check test (npm ci || true) ignores its own failure"]' and zero proposal is true
  Scenario: Preserve fix acceptance
    When k-setup-setup-masks-failure: Validate "fix" command "npm ci || true"
    Then k-setup-setup-masks-failure: problems are '[]' and zero proposal is false
  Scenario: Accumulate another setup problem
    When k-setup-setup-masks-failure: Validate "setup" command "npm test || true"
    Then k-setup-setup-masks-failure: problems are '["setup command npm test || true ignores its own failure","setup command npm test runs tests or linting; put it in checks"]' and zero proposal is true
