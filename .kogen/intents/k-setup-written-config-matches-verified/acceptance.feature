Feature: Written configuration preserves verified commands
  Scenario: Reject controls and guard the actual init commit
    When k-setup-written-config-matches-verified: I exercise validation and init round trips
    Then k-setup-written-config-matches-verified: these obligations hold:
      | newline |
      | split |
      | tab |
      | carriage |
      | fix-control |
      | other-control |
      | quoted |
      | ordinary |
      | setup |
      | fix |
      | check |
      | name |
      | protect |
      | acceptance-run |
      | acceptance-dir |
      | parse |

  Scenario: Preserve the existing init suite
    Then k-setup-written-config-matches-verified: existing init tests stay green
