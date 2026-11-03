Feature: Coverage-backed overlap at initialization
  Scenario: Source-defined setup and full tests subsume separate work
    When k-setup-coverage-backed-overlap: initialization selects commands for "full"
    Then k-setup-coverage-backed-overlap: the observed work is:
      """
      {"full":{"a":1,"b":1},"explicit":{"a":1,"b":1},"setup":{"prep":1,"other":1},"checks":{"a":1,"b":1},"checkCount":1}
      """

  Scenario: Changed discovery makes an explicit path necessary
    When k-setup-coverage-backed-overlap: initialization selects commands for "filtered"
    Then k-setup-coverage-backed-overlap: the observed work is:
      """
      {"full":{"a":1},"explicit":{"a":1,"b":1},"setup":{"prep":1,"other":1},"checks":{"a":1,"b":1},"checkCount":2}
      """

  Scenario: Unknown coverage retains distinct commands
    When k-setup-coverage-backed-overlap: initialization selects commands for "unknown"
    Then k-setup-coverage-backed-overlap: the observed work is:
      """
      {"full":{"a":1,"b":1},"explicit":{"a":1,"b":1},"setup":{"prep":1,"other":1},"checks":{"a":2,"b":2},"checkCount":3}
      """
