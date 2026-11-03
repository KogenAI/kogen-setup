Feature: Exclude checks that ran no tests
  Scenario Outline: A successful no-test check is omitted
    Given the model proposes no fix command
    And the model proposes the check "sample" running "<command>"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And the no-tests project has no configured checks
    And the "Left out:" line contains "sample (<command>) ran no tests"
    And the "Checks:" line contains "none passed"

    Examples:
      | command |
      | env printf '?   example/a [no test files]' |
      | env printf '0 tests, 0 failures' |
      | env printf 'Ran 0 tests' |
      | env printf 'No tests found' |
      | env printf '0 passing' |
      | env echo '?   example/a [no test files]'; env echo '?   example/b [no test files]' |
      | env printf '?   example/a	[no test files]' |

  Scenario Outline: Keep output that does not prove no tests ran
    Given the model proposes no fix command
    And the model proposes the check "sample" running "<command>"
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And project.yaml lists the checks:
      | sample |
    And stdout has no "Left out:" line

    Examples:
      | command |
      | env echo 'Finished in 0.1 seconds'; env echo '3 tests, 0 failures' |
      | env echo '?   example/a [no test files]'; env echo 'ok   example/b 0.01s' |
      | env printf '' |
      | env printf 'unrecognized output' |
      | env echo '0 tests, 0 failures'; env echo '3 tests, 0 failures' |
      | env echo 'Ran 0 tests'; env echo 'Ran 1 tests' |
      | env echo 'No tests found'; env echo '1 passing' |
      | env echo '0 passing'; env echo '1 passing' |
      | env echo '?   example/a [no test files]'; env echo 'PASS' |
