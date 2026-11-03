Feature: Setup preserves tracked files
  Scenario: Reject the synthetic settling edit and restore before later setup and checks
    Given the tracked setup proposal:
      """
      {"setup":["mkdir -p deps && echo d > deps/f","grep -q y a.txt || echo y >> a.txt","true","test \"$(cat a.txt)\" = x && test -f deps/f"],"fix":[],"checks":[{"name":"ok","run":"test \"$(cat a.txt)\" = x"}],"protect":[]}
      """
    When init verifies the tracked setup fixture
    Then the tracked setup observation is:
      """
      {"setup":["mkdir -p deps && echo d > deps/f","true","test \"$(cat a.txt)\" = x && test -f deps/f"],"checks":["ok"],"lines":["Setup: mkdir -p deps && echo d > deps/f; true; test \"$(cat a.txt)\" = x && test -f deps/f","Checks: ok","Left out: setup-2 (grep -q y a.txt || echo y >> a.txt) changed a.txt"],"a":"x\n"}
      """

  Scenario: Ignored and untracked files remain available
    Given the tracked setup proposal:
      """
      {"setup":["mkdir -p deps && echo d > deps/f","echo u > scratch","true"],"fix":[],"checks":[{"name":"ok","run":"test -f deps/f && test -f scratch"}],"protect":[]}
      """
    When init verifies the tracked setup fixture
    Then the tracked setup observation is:
      """
      {"setup":["mkdir -p deps && echo d > deps/f","echo u > scratch","true"],"checks":["ok"],"lines":["Setup: mkdir -p deps && echo d > deps/f; echo u > scratch; true","Checks: ok"],"a":"x\n"}
      """

  Scenario Outline: Restore mode and existence
    Given the tracked setup proposal:
      """
      {"setup":["<command>"],"fix":[],"checks":[{"name":"ok","run":"test -f a.txt && test ! -x a.txt && test \"$(cat a.txt)\" = x"}],"protect":[]}
      """
    When init verifies the tracked setup fixture
    Then the tracked setup observation is:
      """
      {"setup":[],"checks":["ok"],"lines":["Setup: none","Checks: ok","Left out: setup-1 (<command>) changed a.txt"],"a":"x\n"}
      """
    Examples:
      | command        |
      | chmod +x a.txt |
      | rm -f a.txt    |

  Scenario Outline: Bound the changed-path display
    Given the tracked setup proposal:
      """
      {"setup":["printf y > a.txt; printf y > b.txt; printf y > c.txt; printf y > d.txt; printf y > e.txt<extra>"],"fix":[],"checks":[{"name":"ok","run":"test \"$(cat a.txt b.txt c.txt d.txt e.txt f.txt | tr -d '\\n')\" = xxxxxx"}],"protect":[]}
      """
    When init verifies the tracked setup fixture
    Then the tracked setup observation is:
      """
      {"setup":[],"checks":["ok"],"lines":["Setup: none","Checks: ok","Left out: setup-1 (printf y > a.txt; printf y > b.txt; printf y > c.txt; printf y > d.txt; printf y > e.txt<extra>) changed a.txt, b.txt, c.txt, d.txt, e.txt<suffix>"],"a":"x\n"}
      """
    Examples:
      | extra             | suffix |
      |                   |        |
      | ; printf y > f.txt | , ...  |

  Scenario Outline: Keep second-run rejection precedence
    Given the tracked setup proposal:
      """
      {"setup":["<command>"],"fix":[],"checks":[{"name":"ok","run":"test \"$(cat a.txt)\" = x"}],"protect":[]}
      """
    When init verifies the tracked setup fixture
    Then the tracked setup observation is:
      """
      {"setup":[],"checks":["ok"],"lines":["Setup: none","Checks: ok","Left out: setup-1 (<command>) is not repeatable: its second run <reason>"],"a":"x\n"}
      """
    Examples:
      | command                                      | reason                |
      | grep -q y a.txt && exit 7; echo y >> a.txt     | failed with status 7  |
      | echo y >> a.txt                               | changed a.txt         |
