Feature: Report detected checks displaced by proposals

  Scenario: Narrowed suite
    When k-setup-replaced-detected-check-reported: Init receives this proposal:
      """
      {"checks":[{"name":"go-test","run":"go test ./cmd/app"}]}
      """
    Then k-setup-replaced-detected-check-reported: the summary and saved checks are:
      """
      {"lines":["Replaced: go-test (go test ./...) with (go test ./cmd/app)"],"kept":{"go-test":"go test ./cmd/app"}}
      """

  Scenario: Same command
    When k-setup-replaced-detected-check-reported: Init receives this proposal:
      """
      {"checks":[{"name":"go-test","run":"go test ./..."}]}
      """
    Then k-setup-replaced-detected-check-reported: the summary and saved checks are:
      """
      {"lines":[],"kept":{"go-test":"go test ./..."}}
      """

  Scenario: New name
    When k-setup-replaced-detected-check-reported: Init receives this proposal:
      """
      {"checks":[{"name":"lint","run":"go vet ./cmd/app"}]}
      """
    Then k-setup-replaced-detected-check-reported: the summary and saved checks are:
      """
      {"lines":[],"kept":{"lint":"go vet ./cmd/app","go-test":"go test ./..."}}
      """

  Scenario: Detected order
    When k-setup-replaced-detected-check-reported: Init receives this proposal:
      """
      {"checks":[{"name":"go-test","run":"go test ./cmd/app"},{"name":"go-format","run":"go fmt ./cmd/app"}]}
      """
    Then k-setup-replaced-detected-check-reported: the summary and saved checks are:
      """
      {"lines":["Replaced: go-format (test -z \"$(gofmt -l .)\") with (go fmt ./cmd/app)","Replaced: go-test (go test ./...) with (go test ./cmd/app)"],"kept":{"go-format":"go fmt ./cmd/app","go-test":"go test ./cmd/app"}}
      """
