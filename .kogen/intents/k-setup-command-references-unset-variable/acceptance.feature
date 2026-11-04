Feature: Refuse commands that depend on variables unset in the init environment
  Validate receives the init environment in InitContext.Env. Here it is exactly SET_ONE=1;
  UNSET_ONE and UNSET_TWO are not set.

  Scenario: Existing validation and init tests stay green
    When k-setup-command-references-unset-variable: run existing setup tests requiring these passing tests
      """
      ["TestValidateCredentials", "TestValidateCommandsOutsideProject", "TestInitVerifyBudgetStopsRemainingCommands", "TestInitRunsFixersOnceAfterTheChecksOnTheCopy", "TestInitFailedFixerOutputBoundaries", "TestInitMutationPathListAtFive"]
      """
    Then k-setup-command-references-unset-variable: problems equal
      """
      []
      """

  Scenario Outline: Validate a proposed command against the init environment
    When k-setup-command-references-unset-variable: Validate this proposal
      """
      {"role":"<role>","command":<command>,"env":["SET_ONE=1"]}
      """
    Then k-setup-command-references-unset-variable: problems equal
      """
      <problems>
      """

    Examples:
      | role  | command | problems |
      | check | "echo $SET_ONE" | [] |
      | check | "echo $UNSET_ONE" | ["check t (echo $UNSET_ONE) references variable UNSET_ONE, which is not set in the init environment; use a literal value or a project path instead"] |
      | check | "UNSET_ONE=x sh -c 'true'" | [] |
      | check | "export UNSET_ONE=x; echo \"$UNSET_ONE\"" | [] |
      | check | "echo ${UNSET_ONE:-fallback}" | [] |
      | check | "echo '$UNSET_ONE'" | [] |
      | check | "echo \"$UNSET_ONE\"" | ["check t (echo \"$UNSET_ONE\") references variable UNSET_ONE, which is not set in the init environment; use a literal value or a project path instead"] |
      | setup | "cd \"${UNSET_ONE}\" && make" | ["setup command cd \"${UNSET_ONE}\" && make references variable UNSET_ONE, which is not set in the init environment; use a literal value or a project path instead"] |
      | fix   | "fmt $UNSET_ONE" | ["fix command fmt $UNSET_ONE references variable UNSET_ONE, which is not set in the init environment; use a literal value or a project path instead"] |
      | check | "echo $HOME $PWD $?" | ["check t (echo $HOME $PWD $?) reaches outside the project folder; use a path inside the project"] |
      | check | "echo $PWD $PATH $USER $? $1 $# $@ $* $$ $! $- $0" | [] |
      | check | "for UNSET_ONE in a b; do echo \"$UNSET_ONE\"; done" | [] |
      | check | "echo ${UNSET_ONE-x} ${UNSET_ONE:=y}" | [] |
      | check | "echo ${SET_ONE}" | [] |
      | check | "echo $UNSET_ONE; UNSET_ONE=x" | ["check t (echo $UNSET_ONE; UNSET_ONE=x) references variable UNSET_ONE, which is not set in the init environment; use a literal value or a project path instead"] |
      | check | "echo $UNSET_ONE $UNSET_TWO $UNSET_ONE" | ["check t (echo $UNSET_ONE $UNSET_TWO $UNSET_ONE) references variable UNSET_ONE, which is not set in the init environment; use a literal value or a project path instead", "check t (echo $UNSET_ONE $UNSET_TWO $UNSET_ONE) references variable UNSET_TWO, which is not set in the init environment; use a literal value or a project path instead"] |
      | check | "go test ./..." | [] |
      | setup | "npm ci" | [] |
      | fix   | "gofmt -w ." | [] |

  Scenario: Init keeps a check whose variables are set where init runs its commands
    When k-setup-command-references-unset-variable: run init with this proposal
      """
      {"checks":[{"name":"t","run":"test \"$SET_ONE\" = 1 && test -n \"$KOGEN_NODE\""}],"env":["SET_ONE=1"]}
      """
    Then k-setup-command-references-unset-variable: the init result equals
      """
      {"exit":0,"requests":1,"correction":"","checks":["t"]}
      """

  Scenario: Init refuses a check that uses an unset variable and writes nothing
    When k-setup-command-references-unset-variable: run init with this proposal
      """
      {"checks":[{"name":"t","run":"echo \"$UNSET_ONE\""}],"env":["SET_ONE=1"]}
      """
    Then k-setup-command-references-unset-variable: the init result equals
      """
      {"exit":4,"requests":2,"correction":"invalid: check t (echo \"$UNSET_ONE\") references variable UNSET_ONE, which is not set in the init environment; use a literal value or a project path instead","checks":null}
      """
