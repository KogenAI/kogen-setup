Feature: k-consumes-setup: Explicit dependency consumption
  Scenario Outline: Each producer has runnable consumption assertions
    Then k-consumes-setup: go test succeeds for "<package>"
    Examples:
      | package                            |
      | ./consumes/kogen-coordinator/...    |
      | ./consumes/kogen-executor/...       |
      | ./consumes/kogen-loop/...           |
      | ./consumes/kogen-verification/...   |

  Scenario: Document the complete source audit
    Then k-consumes-setup: the consumption audit exists at "consumes/README.md"

  Scenario: Preserve production and pins from current bytes
    Then k-consumes-setup: the original file digest is "d8f1da76cba0074e6e9a1fc8119d6950ba040e218bf2fe19eae1499093cffe7c"

  Scenario: Run contracts in the normal test entry point
    Then k-consumes-setup: go test succeeds for "./..."
