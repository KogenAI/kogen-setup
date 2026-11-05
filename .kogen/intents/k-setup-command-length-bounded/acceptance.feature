Feature: Refuse commands longer than 2000 characters

  In these scenarios "{{<unit>*<n>}}" inside a JSON string stands for <unit> repeated n times.

  Scenario: The request's echo example has 1999 characters and keeps only its existing runs-nothing refusal
    When k-setup-command-length-bounded: Validate in project folder "/work/project" the proposal:
      """
      {"setup":["echo {{a*1994}}"]}
      """
    Then k-setup-command-length-bounded: the submitted commands have these character counts:
      """
      {"setup":[1999],"fix":[],"checks":[]}
      """
    And k-setup-command-length-bounded: problems equal:
      """
      ["setup command echo {{a*1994}} runs nothing"]
      """

  Scenario: Setup, fix and check commands of exactly 2000 characters are accepted as given
    When k-setup-command-length-bounded: Validate in project folder "/work/project" the proposal:
      """
      {"setup":["touch {{a*1994}}"],"fix":["touch {{b*1994}}"],"checks":[{"name":"lint","run":"echo {{a*1995}}"}]}
      """
    Then k-setup-command-length-bounded: the submitted commands have these character counts:
      """
      {"setup":[2000],"fix":[2000],"checks":[2000]}
      """
    And k-setup-command-length-bounded: problems equal:
      """
      []
      """
    And k-setup-command-length-bounded: the proposal equals:
      """
      {"setup":["touch {{a*1994}}"],"fix":["touch {{b*1994}}"],"checks":[{"name":"lint","run":"echo {{a*1995}}"}],"protect":[]}
      """

  Scenario: A 2000-character check of multibyte characters is accepted as given
    When k-setup-command-length-bounded: Validate in project folder "/work/project" the proposal:
      """
      {"checks":[{"name":"lint","run":"echo {{é*1995}}"}]}
      """
    Then k-setup-command-length-bounded: the submitted commands have these character counts:
      """
      {"setup":[],"fix":[],"checks":[2000]}
      """
    And k-setup-command-length-bounded: problems equal:
      """
      []
      """
    And k-setup-command-length-bounded: the proposal equals:
      """
      {"setup":[],"fix":[],"checks":[{"name":"lint","run":"echo {{é*1995}}"}],"protect":[]}
      """

  Scenario: Setup, fix and check commands of 2001 characters get three short length refusals
    When k-setup-command-length-bounded: Validate in project folder "/work/project" the proposal:
      """
      {"setup":["{{x*2001}}"],"fix":["{{x*2001}}"],"checks":[{"name":"lint","run":"{{x*2001}}"}]}
      """
    Then k-setup-command-length-bounded: the submitted commands have these character counts:
      """
      {"setup":[2001],"fix":[2001],"checks":[2001]}
      """
    And k-setup-command-length-bounded: problems equal:
      """
      ["check lint command {{x*40}}… is longer than 2000 characters; put long scripts in a file in the project and run that",
       "setup command {{x*40}}… is longer than 2000 characters; put long scripts in a file in the project and run that",
       "fix command {{x*40}}… is longer than 2000 characters; put long scripts in a file in the project and run that"]
      """
    And k-setup-command-length-bounded: every problem is shorter than 200 characters
    And k-setup-command-length-bounded: the proposal equals:
      """
      {"setup":[],"fix":[],"checks":[],"protect":[]}
      """

  Scenario: A 2001-character check of multibyte characters is refused showing its first 40 characters
    When k-setup-command-length-bounded: Validate in project folder "/work/project" the proposal:
      """
      {"checks":[{"name":"lint","run":"echo {{é*1996}}"}]}
      """
    Then k-setup-command-length-bounded: the submitted commands have these character counts:
      """
      {"setup":[],"fix":[],"checks":[2001]}
      """
    And k-setup-command-length-bounded: problems equal:
      """
      ["check lint command echo {{é*35}}… is longer than 2000 characters; put long scripts in a file in the project and run that"]
      """
    And k-setup-command-length-bounded: the proposal equals:
      """
      {"setup":[],"fix":[],"checks":[],"protect":[]}
      """

  Scenario: A 2000-character check naming the project folder by absolute path keeps its existing refusal
    When k-setup-command-length-bounded: Validate in project folder "/work/project" the proposal:
      """
      {"checks":[{"name":"lint","run":"cat /work/project/README.md # {{z*1970}}"}]}
      """
    Then k-setup-command-length-bounded: the submitted commands have these character counts:
      """
      {"setup":[],"fix":[],"checks":[2000]}
      """
    And k-setup-command-length-bounded: problems equal:
      """
      ["check lint (cat /work/project/README.md # {{z*1970}}) names the project folder by absolute path; use a relative path"]
      """

  Scenario: A 2001-character check naming the project folder by absolute path gets only the length refusal
    When k-setup-command-length-bounded: Validate in project folder "/work/project" the proposal:
      """
      {"checks":[{"name":"lint","run":"cat /work/project/README.md # {{z*1971}}"}]}
      """
    Then k-setup-command-length-bounded: the submitted commands have these character counts:
      """
      {"setup":[],"fix":[],"checks":[2001]}
      """
    And k-setup-command-length-bounded: problems equal:
      """
      ["check lint command cat /work/project/README.md # {{z*10}}… is longer than 2000 characters; put long scripts in a file in the project and run that"]
      """
    And k-setup-command-length-bounded: every problem is shorter than 200 characters

  Scenario: An over-long check with a credential literal gets only the length refusal, shown redacted
    When k-setup-command-length-bounded: Validate in project folder "/work/project" the proposal:
      """
      {"checks":[{"name":"lint","run":"TOKEN=abc123 make lint # {{x*1980}}"}]}
      """
    Then k-setup-command-length-bounded: the submitted commands have these character counts:
      """
      {"setup":[],"fix":[],"checks":[2005]}
      """
    And k-setup-command-length-bounded: problems equal:
      """
      ["check lint command TOKEN=*** make lint # {{x*18}}… is longer than 2000 characters; put long scripts in a file in the project and run that"]
      """

  Scenario: An over-long setup command with a control character gets only the length refusal, shown quoted
    When k-setup-command-length-bounded: Validate in project folder "/work/project" the proposal:
      """
      {"setup":["make\n{{x*2000}}"]}
      """
    Then k-setup-command-length-bounded: the submitted commands have these character counts:
      """
      {"setup":[2005],"fix":[],"checks":[]}
      """
    And k-setup-command-length-bounded: problems equal:
      """
      ["setup command \"make\\n{{x*35}}\"… is longer than 2000 characters; put long scripts in a file in the project and run that"]
      """
    And k-setup-command-length-bounded: every problem is shorter than 200 characters
