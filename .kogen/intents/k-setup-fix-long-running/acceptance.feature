Feature: Refuse long-running fix commands before running them

  Validate applies initLongRunning to fix commands with the problem
  "fix command <command> does not exit on its own (watch or server mode); use a command that runs once".
  Setup and check problems keep their existing wording. Init sends the problem back in its single
  correction round, so the refused fixer never runs. The recognised patterns stay the existing ones.

  Scenario: A watch-mode fix is refused while the one-shot prettier --write fix is accepted
    When k-setup-fix-long-running: Validate arguments:
      """
      {"fix":["tsc --watch","prettier --write ."]}
      """
    Then k-setup-fix-long-running: all problems equal:
      """
      ["fix command tsc --watch does not exit on its own (watch or server mode); use a command that runs once"]
      """

  Scenario: No new patterns: prettier --watch stays unrecognised in fix, setup and checks
    When k-setup-fix-long-running: Validate arguments:
      """
      {"fix":["tsc --watch","prettier --watch ."],"setup":["prettier --watch ."],"checks":[{"name":"b","run":"prettier --watch ."}]}
      """
    Then k-setup-fix-long-running: all problems equal:
      """
      ["fix command tsc --watch does not exit on its own (watch or server mode); use a command that runs once"]
      """

  Scenario Outline: Fix commands that initLongRunning already recognises are refused by name
    When k-setup-fix-long-running: Validate arguments:
      """
      {"fix":["<command>","prettier --write ."]}
      """
    Then k-setup-fix-long-running: long-running problems equal:
      """
      ["fix command <command> does not exit on its own (watch or server mode); use a command that runs once"]
      """
    Examples:
      | command              |
      | tsc --watch          |
      | npx jest --watch     |
      | npm run dev          |
      | mix phx.server       |
      | echo ok && npm start |
      | sleep 2m             |

  Scenario: Setup and checks keep their existing problem text next to the new fix problem
    When k-setup-fix-long-running: Validate arguments:
      """
      {"setup":["tsc --watch"],"checks":[{"name":"a","run":"tsc --watch"}],"fix":["tsc --watch"]}
      """
    Then k-setup-fix-long-running: all problems equal:
      """
      ["check a (tsc --watch) does not exit on its own (watch or server mode); use a command that runs once","setup command tsc --watch does not exit on its own (watch or server mode); use a command that runs once","fix command tsc --watch does not exit on its own (watch or server mode); use a command that runs once"]
      """

  Scenario: Init corrects a watch-mode fix before verification and keeps the corrected --write fix
    When k-setup-fix-long-running: init runs with the model replies:
      """
      [{"setup":[],"fix":["tsc --watch"],"checks":[{"name":"readme","run":"grep -qx '# notes' README.md"}],"protect":[]},{"setup":[],"fix":["prettier --write ."],"checks":[{"name":"readme","run":"grep -qx '# notes' README.md"}],"protect":[]}]
      """
    Then k-setup-fix-long-running: the init outcome is:
      """
      {"exit":0,"error":"","requests":2,"correction":"invalid: fix command tsc --watch does not exit on its own (watch or server mode); use a command that runs once","fix":["prettier --write ."],"watchRan":false,"prettierLog":"--write .\n","status":"","maxElapsedMs":20000}
      """
    And k-setup-fix-long-running: existing init tests pass
