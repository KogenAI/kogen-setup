Feature: Restore the verification copy after omitting setup

  Scenario: Failed setup cannot supply a passing check
    Given the tracked setup proposal:
      """
      {"setup":["mkdir gen && echo x > gen/a && exit 1"],"fix":[],"checks":[{"name":"t","run":"test -f gen/a"}],"protect":[]}
      """
    When init verifies the tracked setup fixture
    Then the omitted setup selection is:
      """
      {"setup":[],"checks":[],"a":"x\n"}
      """

  Scenario: Nonrepeatable append is removed
    Given the tracked setup proposal:
      """
      {"setup":["echo n >> state.txt"],"fix":[],"checks":[{"name":"t","run":"test ! -f state.txt"}],"protect":[]}
      """
    When init verifies the tracked setup fixture
    Then the omitted setup selection is:
      """
      {"setup":[],"checks":["t"],"a":"x\n"}
      """

  Scenario: Repeatable directory remains available
    Given the tracked setup proposal:
      """
      {"setup":["mkdir -p gen"],"fix":[],"checks":[{"name":"t","run":"test -d gen"}],"protect":[]}
      """
    When init verifies the tracked setup fixture
    Then the omitted setup selection is:
      """
      {"setup":["mkdir -p gen"],"checks":["t"],"a":"x\n"}
      """

  Scenario: Restore tracked content without deleting earlier kept effects
    Given the tracked setup proposal:
      """
      {"setup":["mkdir -p kept","echo bad > a.txt; mkdir -p deps; echo bad > deps/partial; exit 1","test -d kept && test ! -e deps/partial && test \"$(cat a.txt)\" = x"],"fix":[],"checks":[{"name":"t","run":"test -d kept && test ! -e deps/partial && test \"$(cat a.txt)\" = x"}],"protect":[]}
      """
    When init verifies the tracked setup fixture
    Then the omitted setup selection is:
      """
      {"setup":["mkdir -p kept","test -d kept && test ! -e deps/partial && test \"$(cat a.txt)\" = x"],"checks":["t"],"a":"x\n"}
      """
