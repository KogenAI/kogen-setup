Feature: Init qualifies commands that read Git in a Git copy of the committed tree
  This feature runs the compiled standalone init command on a fixture repository with a local scripted proposal and reads its summary and the real repository afterwards. Each case commits the listed files, applies the uncommitted edits, serves the given proposal and requires the exact summary lines.

  Scenario: A Git-reading check is kept
    Then setup-init-qualifies-git-reading-checks: init summarises the case
      """
      {"files":{"README.md":"# Git copy fixture\n"},"proposal":{"setup":[],"fix":[],"checks":[{"name":"tracked","run":"test -n \"$(git ls-files)\""}],"protect":[]},"want":["Checks: tracked"],"notWant":["failed with status","Left out"]}
      """

  Scenario: A check that reads Git and fails is still left out
    Then setup-init-qualifies-git-reading-checks: init summarises the case
      """
      {"files":{"README.md":"# Git copy fixture\n"},"proposal":{"setup":[],"fix":[],"checks":[{"name":"tracked","run":"git ls-files > /dev/null; exit 1"}],"protect":[]},"want":["Checks: none passed","Left out: tracked (git ls-files > /dev/null; exit 1) failed with status 1"]}
      """

  Scenario: A check that commits and configures Git leaves the real repository alone
    Then setup-init-qualifies-git-reading-checks: init summarises the case
      """
      {"files":{"README.md":"# Git copy fixture\n","probe.sh":"git ls-files --error-unmatch probe.sh >/dev/null || exit 1\ngit commit --allow-empty -m probe\ngit config user.name probe\nexit 0\n"},"proposal":{"setup":[],"fix":[],"checks":[{"name":"probe","run":"sh probe.sh"}],"protect":[]},"want":["Checks: probe"],"realRepo":true}
      """

  Scenario: The copy's Git state is the committed tree of a dirty repository
    Then setup-init-qualifies-git-reading-checks: init summarises the case
      """
      {"files":{"README.md":"committed\n"},"dirty":{"README.md":"edited\n","scratch.txt":"untracked\n"},"proposal":{"setup":[],"fix":[],"checks":[{"name":"headtree","run":"test \"$(git show HEAD:README.md)\" = committed && test \"$(cat README.md)\" = committed && test ! -e scratch.txt && test -z \"$(git status --porcelain -- . ':!features')\""}],"protect":[]},"want":["Checks: headtree"]}
      """
