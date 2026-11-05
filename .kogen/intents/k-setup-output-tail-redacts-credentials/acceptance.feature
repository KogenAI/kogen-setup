Feature: Init redacts credentials in left-out command output

  Scenario: A failing check's echoed token is redacted in its output tail
    When k-setup-output-tail-redacts-credentials: Init runs on a repository holding only README.md with this proposal:
      """
      {"setup":[],"fix":[],"checks":[{"name":"bad","run":"echo API_TOK\"\"EN=abcd1234\"\"secretvalue; echo plain line; exit 2"},{"name":"good","run":"test -f README.md"}],"protect":[]}
      """
    Then k-setup-output-tail-redacts-credentials: stderr shows these output lines under check "bad":
      """
      ["API_TOKEN=***","plain line"]
      """
    And k-setup-output-tail-redacts-credentials: stderr does not contain "abcd1234secretvalue"
    And k-setup-output-tail-redacts-credentials: stdout is:
      """
      Initialized Kogen in {repo}
      Setup: none
      Fix: none
      Checks: good
      Protect: none
      Left out: bad (echo API_TOK""EN=abcd1234""secretvalue; echo plain line; exit 2) failed with status 2
      Acceptance: Cucumber bridge added in features/steps
      Commit: {sha8} Add Kogen configuration
      """
    And k-setup-output-tail-redacts-credentials: the committed checks are:
      """
      [{"name":"good","run":"test -f README.md"}]
      """

  Scenario: Authorization headers, URL passwords and secrets at the width cut are redacted
    When k-setup-output-tail-redacts-credentials: Init runs on a repository holding only README.md with this proposal:
      """
      {"setup":[],"fix":[],"checks":[{"name":"leak","run":"echo \"Author\"\"ization: Bear\"\"er abc123\"\"def456\"; echo fetching https:\"\"//bot:hun\"\"ter2secret@git.invalid/x.git; printf '%0180d %s\\n' 0 https:\"\"//bot:abcdefgh\"\"ijklmnop@git.invalid/x.git; exit 6"},{"name":"good","run":"test -f README.md"}],"protect":[]}
      """
    Then k-setup-output-tail-redacts-credentials: stderr shows these output lines under check "leak":
      """
      ["Authorization: Bearer ***","fetching https://bot:***@git.invalid/x.git","000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000 https://bot:***@git"]
      """
    And k-setup-output-tail-redacts-credentials: stderr does not contain "abc123def456"
    And k-setup-output-tail-redacts-credentials: stderr does not contain "hunter2secret"
    And k-setup-output-tail-redacts-credentials: stdout has the line:
      """
      Left out: leak (echo "Author""ization: Bear""er abc123""def456"; echo fetching https:""//bot:hun""ter2secret@git.invalid/x.git; printf '%0180d %s\n' 0 https:""//bot:abcdefgh""ijklmnop@git.invalid/x.git; exit 6) failed with status 6
      """

  Scenario: A failing check without credentials prints the same tail as before
    When k-setup-output-tail-redacts-credentials: Init runs on a repository holding only README.md with this proposal:
      """
      {"setup":[],"fix":[],"checks":[{"name":"plain","run":"printf 'plain one\\n\\tindented\\n\\nlast\\n'; exit 4"},{"name":"good","run":"test -f README.md"}],"protect":[]}
      """
    Then k-setup-output-tail-redacts-credentials: stderr shows these output lines under check "plain":
      """
      ["plain one","\tindented","","last"]
      """
    And k-setup-output-tail-redacts-credentials: stdout has the line:
      """
      Left out: plain (printf 'plain one\n\tindented\n\nlast\n'; exit 4) failed with status 4
      """
