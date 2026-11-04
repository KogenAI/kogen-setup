Feature: Init summary reports kept fix commands and protected paths

  Scenario: Kept fix and protected path
    When k-setup-summary-reports-fix-and-protect: Init runs with gofmt exiting 0 and this proposal:
      """
      {"setup":[],"fix":["gofmt -w ."],"checks":[{"name":"ok","run":"test -f Makefile"}],"protect":["Makefile"]}
      """
    Then k-setup-summary-reports-fix-and-protect: Init exits 0 and prints:
      """
      Initialized Kogen in {repo}
      Setup: none
      Fix: gofmt -w .
      Checks: ok
      Protect: Makefile
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha8} Add Kogen configuration
      """
    And k-setup-summary-reports-fix-and-protect: the committed configuration has:
      """
      {"fix":["gofmt -w ."],"protect":["Makefile"]}
      """

  Scenario: Nothing to fix or protect
    When k-setup-summary-reports-fix-and-protect: Init runs with gofmt exiting 0 and this proposal:
      """
      {"setup":[],"fix":[],"checks":[{"name":"ok","run":"test -f Makefile"}],"protect":[]}
      """
    Then k-setup-summary-reports-fix-and-protect: Init exits 0 and prints:
      """
      Initialized Kogen in {repo}
      Setup: none
      Fix: none
      Checks: ok
      Protect: none
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha8} Add Kogen configuration
      """
    And k-setup-summary-reports-fix-and-protect: the committed configuration has:
      """
      {"fix":[],"protect":[]}
      """

  Scenario: Failing fix is left out
    When k-setup-summary-reports-fix-and-protect: Init runs with gofmt exiting 5 and this proposal:
      """
      {"setup":[],"fix":["gofmt -w ."],"checks":[{"name":"ok","run":"test -f Makefile"}],"protect":["Makefile"]}
      """
    Then k-setup-summary-reports-fix-and-protect: Init exits 0 and prints:
      """
      Initialized Kogen in {repo}
      Setup: none
      Fix: none
      Checks: ok
      Protect: Makefile
      Left out: fix-1 (gofmt -w .) failed with status 5
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha8} Add Kogen configuration
      """
    And k-setup-summary-reports-fix-and-protect: the committed configuration has:
      """
      {"fix":[],"protect":["Makefile"]}
      """

  Scenario: Several entries
    When k-setup-summary-reports-fix-and-protect: Init runs with gofmt exiting 0 and this proposal:
      """
      {"setup":[],"fix":["gofmt -w .","gofmt -s -w ."],"checks":[{"name":"ok","run":"test -f Makefile"}],"protect":["Makefile","README.md"]}
      """
    Then k-setup-summary-reports-fix-and-protect: Init exits 0 and prints:
      """
      Initialized Kogen in {repo}
      Setup: none
      Fix: gofmt -w .; gofmt -s -w .
      Checks: ok
      Protect: Makefile; README.md
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha8} Add Kogen configuration
      """
    And k-setup-summary-reports-fix-and-protect: the committed configuration has:
      """
      {"fix":["gofmt -w .","gofmt -s -w ."],"protect":["Makefile","README.md"]}
      """
