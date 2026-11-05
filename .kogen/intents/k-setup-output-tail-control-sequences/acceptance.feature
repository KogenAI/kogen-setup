Feature: Init removes control characters from left-out command output

  Scenario: A failing check's colour codes, carriage return and bell are removed from its output tail
    When k-setup-output-tail-control-sequences: Init runs on a repository holding only README.md with this proposal:
      """
      {"setup":[],"fix":[],"checks":[{"name":"bad","run":"printf '\\033[31mred boom\\033[0m\\n'; printf 'one\\rtwo\\n'; printf 'a\\007b\\n'; exit 3"},{"name":"good","run":"test -f README.md"}],"protect":[]}
      """
    Then k-setup-output-tail-control-sequences: stderr shows these output lines under check "bad":
      """
      ["red boom","two","ab"]
      """
    And k-setup-output-tail-control-sequences: no output line on stderr holds a control character other than tab
    And k-setup-output-tail-control-sequences: stdout is:
      """
      Initialized Kogen in {repo}
      Setup: none
      Fix: none
      Checks: good
      Protect: none
      Left out: bad (printf '\033[31mred boom\033[0m\n'; printf 'one\rtwo\n'; printf 'a\007b\n'; exit 3) failed with status 3
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha8} Add Kogen configuration
      """
    And k-setup-output-tail-control-sequences: the committed checks are:
      """
      [{"name":"good","run":"test -f README.md"}]
      """

  Scenario: Terminal titles, carriage-return progress and other control characters are cleaned
    When k-setup-output-tail-control-sequences: Init runs on a repository holding only README.md with this proposal:
      """
      {"setup":[],"fix":[],"checks":[{"name":"term","run":"printf '\\033]0;title\\007shown\\n'; printf '\\033]2;t\\033\\\\kept\\n'; printf 'FAIL foo\\r\\n'; printf '10\\r20\\r\\n'; printf '\\033[1;32mok\\033[K done\\n'; printf 'x\\001y\\tz\\177w\\n'; printf '\\033[31m%0200d\\033[0m\\n' 0; exit 5"},{"name":"good","run":"test -f README.md"}],"protect":[]}
      """
    Then k-setup-output-tail-control-sequences: stderr shows these output lines under check "term":
      """
      ["shown","kept","FAIL foo","20","ok done","xy\tzw","00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"]
      """
    And k-setup-output-tail-control-sequences: no output line on stderr holds a control character other than tab
    And k-setup-output-tail-control-sequences: stdout has the line:
      """
      Left out: term (printf '\033]0;title\007shown\n'; printf '\033]2;t\033\\kept\n'; printf 'FAIL foo\r\n'; printf '10\r20\r\n'; printf '\033[1;32mok\033[K done\n'; printf 'x\001y\tz\177w\n'; printf '\033[31m%0200d\033[0m\n' 0; exit 5) failed with status 5
      """

  Scenario: A plain-text failing check prints the same tail as before
    When k-setup-output-tail-control-sequences: Init runs on a repository holding only README.md with this proposal:
      """
      {"setup":[],"fix":[],"checks":[{"name":"plain","run":"printf 'plain one\\n\\tindented\\n\\nlast\\n'; exit 4"},{"name":"good","run":"test -f README.md"}],"protect":[]}
      """
    Then k-setup-output-tail-control-sequences: stderr shows these output lines under check "plain":
      """
      ["plain one","\tindented","","last"]
      """
    And k-setup-output-tail-control-sequences: stdout has the line:
      """
      Left out: plain (printf 'plain one\n\tindented\n\nlast\n'; exit 4) failed with status 4
      """
