Feature: Drop a duplicate fix only when the matching setup or check was kept

  Scenario: A fix matching a setup command that verification left out is verified, not dropped
    When fix-k-setup-setup-fix-same-command: Init runs with:
      """
      {"proposal":{"setup":["printf 'fixed\\n' > README.md"],"fix":["printf 'fixed\\n' > README.md"],"checks":[],"protect":[]},"files":{"README.md":"draft\n"}}
      """
    Then fix-k-setup-setup-fix-same-command: the results are:
      """
      {"saved":{"setup":[],"fix":["printf 'fixed\\n' > README.md"],"checks":[]},"dropped":[],"leftOut":["Left out: setup-1 (printf 'fixed\\n' > README.md) changed README.md"],"fixRuns":["kogen: running fix-1: printf 'fixed\\n' > README.md","kogen: running fix-1 again: printf 'fixed\\n' > README.md"]}
      """

  Scenario: A fix matching a check that verification left out is verified, not dropped
    When fix-k-setup-setup-fix-same-command: Init runs with:
      """
      {"proposal":{"setup":[],"fix":["printf 'fixed\\n' > README.md"],"checks":[{"name":"tidy","run":"printf 'fixed\\n' > README.md"}],"protect":[]},"files":{"README.md":"draft\n"}}
      """
    Then fix-k-setup-setup-fix-same-command: the results are:
      """
      {"saved":{"setup":[],"fix":["printf 'fixed\\n' > README.md"],"checks":[]},"dropped":[],"leftOut":["Left out: tidy (printf 'fixed\\n' > README.md) changed README.md"],"fixRuns":["kogen: running fix-1: printf 'fixed\\n' > README.md","kogen: running fix-1 again: printf 'fixed\\n' > README.md"]}
      """

  Scenario: A failing setup command and the same failing fix are both left out and nothing claims a duplicate
    When fix-k-setup-setup-fix-same-command: Init runs with:
      """
      {"proposal":{"setup":["test -f MISSING.md"],"fix":["test -f MISSING.md"],"checks":[],"protect":[]},"files":{"README.md":"draft\n"}}
      """
    Then fix-k-setup-setup-fix-same-command: the results are:
      """
      {"saved":{"setup":[],"fix":[],"checks":[]},"dropped":[],"leftOut":["Left out: setup-1 (test -f MISSING.md) failed with status 1; fix-1 (test -f MISSING.md) failed with status 1"],"fixRuns":["kogen: running fix-1: test -f MISSING.md"]}
      """

  Scenario: A fix matching a kept setup command or kept check is still dropped without running
    When fix-k-setup-setup-fix-same-command: Init runs with:
      """
      {"proposal":{"setup":["test -f README.md"],"fix":["test  -f README.md","test -r README.md"],"checks":[{"name":"readable","run":"test -r README.md"}],"protect":[]},"files":{"README.md":"draft\n"}}
      """
    Then fix-k-setup-setup-fix-same-command: the results are:
      """
      {"saved":{"setup":["test -f README.md"],"fix":[],"checks":[{"name":"readable","run":"test -r README.md"}]},"dropped":["Dropped: fix: test  -f README.md (already in setup)","Dropped: fix: test -r README.md (already in checks)"],"leftOut":[],"fixRuns":[]}
      """

  Scenario: Each fix is decided against what verification kept, and remaining fixers are numbered in order
    When fix-k-setup-setup-fix-same-command: Init runs with:
      """
      {"proposal":{"setup":["test -f README.md","printf 'fixed\\n' > README.md"],"fix":["test  -f README.md","printf 'fixed\\n' > README.md"],"checks":[],"protect":[]},"files":{"README.md":"draft\n"}}
      """
    Then fix-k-setup-setup-fix-same-command: the results are:
      """
      {"saved":{"setup":["test -f README.md"],"fix":["printf 'fixed\\n' > README.md"],"checks":[]},"dropped":["Dropped: fix: test  -f README.md (already in setup)"],"leftOut":["Left out: setup-2 (printf 'fixed\\n' > README.md) changed README.md"],"fixRuns":["kogen: running fix-1: printf 'fixed\\n' > README.md","kogen: running fix-1 again: printf 'fixed\\n' > README.md"]}
      """

  Scenario: Existing setup tests remain green
    Then fix-k-setup-setup-fix-same-command: the existing setup tests pass
