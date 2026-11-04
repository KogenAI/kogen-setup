Feature: Adopt the canonical loop dependency without behavior changes

  Scenario Outline: Pin canonical main revisions
    Then k-setup-loop-module-path: command succeeds
      """
      test "$(GOWORK=off go list -m -f '{{.Version}}' github.com/KogenAI/<component>)" = '<version>'
      """
    Examples:
      | component          | version                                  |
      | kogen-loop         | v0.0.0-20261104031734-708a69af07b8          |
      | kogen-coordinator  | v0.0.0-20261104010828-f15509472852          |
      | kogen-executor     | v0.0.0-20261104032156-49f915c19779          |
      | kogen-verification | v0.0.0-20261104033953-b7d89bf3b513          |

  Scenario: Remove the compatibility configuration
    Then k-setup-loop-module-path: command succeeds
      """
      test ! -e go.work && test -s go.sum && test "$(go mod edit -json | python3 -c 'import json,sys; m=json.load(sys.stdin); print(len(m.get("Replace") or []))')" = 0
      """
    And k-setup-loop-module-path: command succeeds
      """
      GOWORK=off go list -m all > /tmp/k-setup-loop-modules-$$ && ! grep '^kogen-loop ' /tmp/k-setup-loop-modules-$$; s=$?; rm -f /tmp/k-setup-loop-modules-$$; exit "$s"
      """

  Scenario: Remove bare imports including generated driver templates
    Then k-setup-loop-module-path: command succeeds
      """
      grep -rn '"kogen-loop/' --include='*.go' --include='*.go.txt' .; test "$?" = 1
      """

  Scenario: Resolve the real build and test closure without bare imports
    Then k-setup-loop-module-path: command succeeds
      """
      f=$(mktemp); GOWORK=off go list -deps -test -f '{{join .Imports "\n"}}' ./... > "$f" || { rm -f "$f"; exit 1; }; grep '^kogen-loop/' "$f"; s=$?; rm -f "$f"; test "$s" = 1
      """

  Scenario: Keep module metadata tidy
    Then k-setup-loop-module-path: command succeeds
      """
      GOWORK=off go mod tidy -diff
      """

  Scenario: Preserve existing behavior
    Then k-setup-loop-module-path: command succeeds
      """
      go build ./... && go vet ./... && go test ./... && go test -race -count=1 ./...
      """
