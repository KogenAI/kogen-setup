Feature: Check repeatability on the same copy
  Scenario: Omit fresh-only checks, keep stable checks and do not retry initial failures
    When k-setup-check-not-repeatable: Init verifies this proposal on a committed README fixture:
      """
      {"setup":[],"fix":[],"checks":[{"name":"once","run":"test ! -e .ran && touch .ran"},{"name":"stable","run":"test -f README.md"},{"name":"fails","run":"exit 7"}],"protect":[]}
      """
    Then k-setup-check-not-repeatable: the saved check names, summary and repeat progress are:
      """
      {"exit":0,"checks":["stable"],"lines":["Checks: stable","Left out: once (test ! -e .ran && touch .ran) is not repeatable: its second run failed with status 1; fails (exit 7) failed with status 7"],"again":["kogen: running once again: test ! -e .ran && touch .ran","kogen: running stable again: test -f README.md"]}
      """

  Scenario: Omit a check whose second execution times out even with a successful TERM handler
    When k-setup-check-not-repeatable: Init verifies this proposal on a committed README fixture:
      """
      {"setup":[],"fix":[],"checks":[{"name":"hang","run":"if test -e .ran; then trap 'exit 0' TERM; while :; do :; done; else touch .ran; fi"},{"name":"stable","run":"test -f README.md"}],"protect":[]}
      """
    Then k-setup-check-not-repeatable: the saved check names, summary and repeat progress are:
      """
      {"exit":0,"checks":["stable"],"lines":["Checks: stable","Left out: hang (if test -e .ran; then trap 'exit 0' TERM; while :; do :; done; else touch .ran; fi) is not repeatable: its second run timed out after 10m"],"again":["kogen: running hang again: if test -e .ran; then trap 'exit 0' TERM; while :; do :; done; else touch .ran; fi","kogen: running stable again: test -f README.md"]}
      """
