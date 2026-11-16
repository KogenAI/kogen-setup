Feature: Init reads the no-tests reports of common runners
  This feature checks how kogen init decides that a check ran no tests, for the reports of Minitest, RSpec, Cargo, Go, Elixir and unittest.
  In the tables, \n separates the lines of one output.

  Scenario: Minitest and Rails
    When setup-init-no-tests-covers-common-runners: initRanNoTests classifies these outputs:
      | output | no tests |
      | 0 runs, 0 assertions, 0 failures, 0 errors, 0 skips | true |
      | 1676 runs, 6242 assertions, 0 failures, 0 errors, 2 skips | false |
      | 0 runs, 0 assertions, 0 failures, 0 errors, 0 skips\n1 runs, 2 assertions, 0 failures, 0 errors, 0 skips | false |
    Then setup-init-no-tests-covers-common-runners: every output is classified as expected

  Scenario: RSpec
    When setup-init-no-tests-covers-common-runners: initRanNoTests classifies these outputs:
      | output | no tests |
      | 0 examples, 0 failures | true |
      | 1 example, 0 failures | false |
      | 12 examples, 0 failures | false |
      | 0 examples, 0 failures\n1 example, 0 failures | false |
    Then setup-init-no-tests-covers-common-runners: every output is classified as expected

  Scenario: Cargo with doc-tests
    When setup-init-no-tests-covers-common-runners: initRanNoTests classifies these outputs:
      | output | no tests |
      | running 0 tests\ntest result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out | true |
      | running 1 test\ntest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out\nrunning 0 tests\ntest result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out | false |
    Then setup-init-no-tests-covers-common-runners: every output is classified as expected

  Scenario: Go test filter that matches nothing
    When setup-init-no-tests-covers-common-runners: initRanNoTests classifies these outputs:
      | output | no tests |
      | ok   example/a 0.003s [no tests to run] | true |
      | ok   example/a 0.003s | false |
      | ?    example/a [no test files]\nok   example/b 0.01s | false |
      | ok   example/a 0.003s [no tests to run]\n?    example/b [no test files] | true |
    Then setup-init-no-tests-covers-common-runners: every output is classified as expected

  Scenario: Singular counts next to a zero report
    When setup-init-no-tests-covers-common-runners: initRanNoTests classifies these outputs:
      | output | no tests |
      | 0 tests, 0 failures\n1 test, 0 failures | false |
      | Ran 0 tests in 0.000s\nRan 1 test in 0.001s | false |
    Then setup-init-no-tests-covers-common-runners: every output is classified as expected

  Scenario: Init applies the rule to both runs of a check
    When setup-init-no-tests-covers-common-runners: kogen init verifies the check "minitest" running:
      """
      if test -e .empty; then echo '0 runs, 0 assertions, 0 failures, 0 errors, 0 skips'; else touch .empty; echo '5 runs, 9 assertions, 0 failures, 0 errors, 0 skips'; fi
      """
    Then setup-init-no-tests-covers-common-runners: init left the check out with these output lines:
      """
      Left out: minitest (if test -e .empty; then echo '0 runs, 0 assertions, 0 failures, 0 errors, 0 skips'; else touch .empty; echo '5 runs, 9 assertions, 0 failures, 0 errors, 0 skips'; fi) ran no tests
      Checks: none passed
      """
