Feature: Merge whitespace-equivalent commands without changing originals
  Scenario: Stable quote-aware Merge and initUnion
    When command equivalence is observed for:
      """
      {"Detected":{"Checks":[{"Name":"test","Run":"go test ./..."}],"Setup":["npm ci"],"Fix":["gofmt -w ."]},"Proposed":{"Checks":[{"Name":"unit","Run":"go  test ./..."},{"Name":"race","Run":"go test -race ./..."},{"Name":"wide","Run":"echo \"a  b\""},{"Name":"narrow","Run":"echo \"a b\""},{"Name":"single","Run":"echo 'a b'"},{"Name":"order","Run":"go test ./... -race"},{"Name":"tab","Run":"\tgo\ttest ./...\n"}],"Setup":["npm ci","npm  ci "],"Fix":["gofmt\t-w .\n"]},"A":["npm ci","echo \"a  b\""],"B":["npm  ci ","\tnpm\tci\n","echo \"a b\"","echo 'a b'","go test ./...","go test -race ./..."]}
      """
    Then the command equivalence result is:
      """
      {"Merged":{"Setup":["npm ci"],"Fix":["gofmt -w ."],"Checks":[{"Name":"test","Run":"go test ./..."},{"Name":"race","Run":"go test -race ./..."},{"Name":"wide","Run":"echo \"a  b\""},{"Name":"narrow","Run":"echo \"a b\""},{"Name":"single","Run":"echo 'a b'"},{"Name":"order","Run":"go test ./... -race"}],"Protect":[]},"Union":["npm ci","echo \"a  b\"","echo \"a b\"","echo 'a b'","go test ./...","go test -race ./..."]}
      """

  Scenario: Init verifies and writes the first equivalent check only
    Given the model proposes no fix command
    And the model proposes the check "first" running "true"
    And the model proposes the check "second" running "true  "
    When kogen init runs on a repository whose only file is README.md
    Then init exits with status 0
    And project.yaml lists the checks:
      | first |
    And stderr has no line starting with "kogen: checking second:"
