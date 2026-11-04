Feature: Verify checks without earlier check outputs
  Scenario Outline: Generator output cannot enable a later check
    When k-setup-check-needs-earlier-check-output: Init verifies this proposal:
      """
      {"setup":[],"fix":[],"checks":[<checks>],"protect":[]}
      """
    Then k-setup-check-needs-earlier-check-output: the saved checks and summary are:
      """
      {"exit":0,"checks":["gen","plain"],"lines":["Checks: gen, plain","Left out: use (test -f out/gen.txt) failed with status 1"]}
      """
    Examples:
      | checks |
      | {"name":"gen","run":"mkdir -p out && echo ok > out/gen.txt"},{"name":"use","run":"test -f out/gen.txt"},{"name":"plain","run":"test -f README.md"} |
      | {"name":"use","run":"test -f out/gen.txt"},{"name":"gen","run":"mkdir -p out && echo ok > out/gen.txt"},{"name":"plain","run":"test -f README.md"} |

  Scenario: Restore setup files and clean failed check outputs
    When k-setup-check-needs-earlier-check-output: Init verifies this proposal:
      """
      {"setup":["echo original > generated.txt && mkdir -p node_modules && echo dependency > node_modules/installed"],"fix":[],"checks":[{"name":"mutate","run":"echo changed > generated.txt && touch failed-output && exit 1"},{"name":"plain","run":"test ! -e failed-output && test \"$(cat generated.txt)\" = original && test \"$(cat node_modules/installed)\" = dependency && test -f README.md"}],"protect":[]}
      """
    Then k-setup-check-needs-earlier-check-output: the saved checks and summary are:
      """
      {"exit":0,"checks":["plain"],"lines":["Checks: plain","Left out: mutate (echo changed > generated.txt && touch failed-output && exit 1) failed with status 1"]}
      """

  Scenario: Preserve two consecutive runs but clean after the second fails
    When k-setup-check-needs-earlier-check-output: Init verifies this proposal:
      """
      {"setup":[],"fix":[],"checks":[{"name":"once","run":"test ! -e scratch && touch scratch"},{"name":"plain","run":"test ! -e scratch && test -f README.md"}],"protect":[]}
      """
    Then k-setup-check-needs-earlier-check-output: the saved checks and summary are:
      """
      {"exit":0,"checks":["plain"],"lines":["Checks: plain","Left out: once (test ! -e scratch && touch scratch) is not repeatable: its second run failed with status 1"]}
      """
