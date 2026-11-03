Feature: Public setup repository documentation
  Scenario: A public reader can build and test the component
    Then public README contains "https://github.com/KogenAI/kogen"
    And public README contains "git clone https://github.com/KogenAI/kogen-setup"
    And public README contains "go build -o kogen-setup ./cmd/kogen-setup"
    And public README contains "go build ./... && go vet ./... && go test -race -count=1 ./..."
    And public README contains "go test ./... -update"
    And public README contains "contact@kogen.dev" exactly 1 times
    And public README does not match "GOPRIVATE|insteadOf|private KogenAI modules|private mirror|access token"

  Scenario: Public documentation excludes identifying examples and policy clutter
    Then public tree has no file named "SECURITY.md"
    And public tree has no file named "CONTRIBUTING.md"
    And public tree has no file named "BRANDING.md"
    And public documentation does not match "/(?:Users|home)/[^\s]+|~/(?:work[.]noindex)/|kogen-(?:runner|macbook-runner|linux-macbook|bench-eu2)"

  Scenario: The owner receives an audit rather than a rewritten history
    Then public document "docs/public-readiness.md" contains "## Current tree"
    And public document "docs/public-readiness.md" contains "## Public links"
    And public document "docs/public-readiness.md" contains "## Historical findings"
