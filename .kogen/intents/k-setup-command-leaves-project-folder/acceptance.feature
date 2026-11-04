Feature: Commands remain inside a relocatable project
  Scenario: Preserve init tests and one correction opportunity
    When k-setup-command-leaves-project-folder: run existing init tests requiring these passing tests
      """
      ["TestInitRepliesToACallWithItsOutputAndReplaysTheAnswer", "TestInitTwoInvalidAnswersEndWithNothingWritten", "TestInitCorrectsProjectRootCheck"]
      """
    Then k-setup-command-leaves-project-folder: problems equal
      """
      []
      """

  Scenario Outline: Validate a proposed command
    When k-setup-command-leaves-project-folder: Validate this proposal
      """
      {"role":"<role>","command":<command>}
      """
    Then k-setup-command-leaves-project-folder: problems equal
      """
      <problems>
      """

    Examples:
      | role   | command                        | problems |
      | check  | "cd .. && make test"           | ["check test (cd .. && make test) reaches outside the project folder; use a path inside the project"] |
      | setup  | "bash ../shared/setup.sh"      | ["setup command bash ../shared/setup.sh reaches outside the project folder; use a path inside the project"] |
      | fix    | "cp ~/lint.cfg ."              | ["fix command cp ~/lint.cfg . reaches outside the project folder; use a path inside the project"] |
      | check  | "sh -c 'echo ../x'"            | [] |
      | check  | "make -C sub/../app test"      | [] |
      | check  | "go test ./..."                | [] |
      | setup  | "npm ci"                       | [] |
      | check  | "../shared/run-tests.sh"       | ["check test (../shared/run-tests.sh) reaches outside the project folder; use a path inside the project"] |
      | check  | "cat ~/.config/tool"           | ["check test (cat ~/.config/tool) reaches outside the project folder; use a path inside the project"] |
      | check  | "$HOME/bin/lint"               | ["check test ($HOME/bin/lint) reaches outside the project folder; use a path inside the project"] |
      | fix    | "${HOME}/bin/lint"             | ["fix command ${HOME}/bin/lint reaches outside the project folder; use a path inside the project"] |
      | check  | "cat ~"                        | ["check test (cat ~) reaches outside the project folder; use a path inside the project"] |
      | check  | "cat sub/../../file"           | ["check test (cat sub/../../file) reaches outside the project folder; use a path inside the project"] |
      | check  | "cat sub/../file"              | [] |
      | check  | "cat \"../file\""              | ["check test (cat \"../file\") reaches outside the project folder; use a path inside the project"] |
      | check  | "cat \"$HOME/file\""            | ["check test (cat \"$HOME/file\") reaches outside the project folder; use a path inside the project"] |
      | check  | "cat '..' '~' '~/x' '$HOME' '${HOME}' 'sub/../../x'" | [] |
