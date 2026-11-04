Feature: Reject no-op setup and fix commands
  Scenario Outline: Refuse literal no-ops in either command list
    When k-setup-setup-fix-run-nothing: Validate <kind> command:
      """
      <command>
      """
    Then k-setup-setup-fix-run-nothing: problems equal:
      """
      ["<kind> command <command> runs nothing"]
      """
    Examples:
      | kind  | command            |
      | setup | true               |
      | setup | echo ready         |
      | setup | echo done          |
      | setup | :                  |
      | setup | exit 0             |
      | setup | echo ok && exit 0  |
      | fix   | true               |
      | fix   | :                  |
      | fix   | exit 0             |
      | fix   | echo ready         |
      | fix   | printf ok; true    |

  Scenario Outline: Keep useful commands and parser exclusions
    When k-setup-setup-fix-run-nothing: Validate <kind> command:
      """
      <command>
      """
    Then k-setup-setup-fix-run-nothing: problems equal:
      """
      []
      """
    Examples:
      | kind  | command                      |
      | setup | mix deps.get                 |
      | setup | mkdir -p tmp                 |
      | fix   | gofmt -w .                   |
      | fix   | echo x > formatted.txt       |
      | setup | test -f x                    |
      | fix   | test -f x                    |
      | setup | echo hi > out.txt            |
      | fix   | echo hi > out.txt            |
      | setup | go mod download && echo done |
      | fix   | go mod download && echo done |
      | setup | echo $(pwd)                  |
      | fix   | echo $(pwd)                  |
      | setup | echo `pwd`                   |
      | fix   | echo `pwd`                   |

  Scenario: Preserve the check refusal
    When k-setup-setup-fix-run-nothing: Validate checks command:
      """
      true
      """
    Then k-setup-setup-fix-run-nothing: problems equal:
      """
      ["check a (true) runs nothing"]
      """
