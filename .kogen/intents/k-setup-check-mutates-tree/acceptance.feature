Feature: Reject checks that rewrite tracked content
  Scenario: A successful fixer is omitted without contaminating later checks
    Given these proposed mutation checks:
      | name    | run                               |
      | fmt     | echo y > a.txt                    |
      | ok      | true                              |
      | build   | mkdir -p out && echo z > out/b.txt |
      | ok2     | test "$(cat a.txt)" = x           |
      | scratch | echo note >> scratch.log          |
    When init verifies the mutation fixture
    Then the mutation observation is:
      """
      {"lines":["Checks: ok, build, ok2, scratch","Left out: fmt (echo y > a.txt) changed a.txt"],"checks":["ok","build","ok2","scratch"],"a":"x\n"}
      """

  Scenario: Report changed paths in sorted order with a five-path cap
    Given these proposed mutation checks:
      | name | run                                                                |
      | fmt  | for p in f.txt e.txt d.txt c.txt b.txt a.txt; do echo y > "$p"; done |
      | ok2  | test "$(cat a.txt)" = x                                            |
    When init verifies the mutation fixture
    Then the mutation observation is:
      """
      {"lines":["Checks: ok2","Left out: fmt (for p in f.txt e.txt d.txt c.txt b.txt a.txt; do echo y > \"$p\"; done) changed a.txt, b.txt, c.txt, d.txt, e.txt, ..."],"checks":["ok2"],"a":"x\n"}
      """
