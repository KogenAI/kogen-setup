Feature: kogen-setup follows kogen-coordinator's models-file-only configuration

  Scenario: The consumer test passes against the pinned new kogen-coordinator main
    When s-consumes-c-models-only-in-models-yaml: TestRepositoryAndConfig runs against the kogen-coordinator that go.mod pins
    Then s-consumes-c-models-only-in-models-yaml: go.mod requires "github.com/KogenAI/kogen-coordinator v0.0.0-20261106110407-d74daae36f56"
    And s-consumes-c-models-only-in-models-yaml: go.sum lists exactly these kogen-coordinator lines:
      """
      github.com/KogenAI/kogen-coordinator v0.0.0-20261106110407-d74daae36f56 h1:8VmqsU9EArCYwqOTw8e9uuS54nRSlUHSUaDl8W+lYqs=
      github.com/KogenAI/kogen-coordinator v0.0.0-20261106110407-d74daae36f56/go.mod h1:MMc15p3YwlY71dMxfCdX6QlR2jXJbSxL6YA9Y7971c8=
      """
    And s-consumes-c-models-only-in-models-yaml: go.mod requires "github.com/KogenAI/kogen-executor v0.0.0-20261104032156-49f915c19779"
    And s-consumes-c-models-only-in-models-yaml: go.mod requires "github.com/KogenAI/kogen-loop v0.0.0-20261104031734-708a69af07b8"
    And s-consumes-c-models-only-in-models-yaml: go.mod requires "github.com/KogenAI/kogen-verification v0.0.0-20261104033953-b7d89bf3b513"
    And s-consumes-c-models-only-in-models-yaml: TestRepositoryAndConfig passed

  Scenario: The consumer test does not accept the former models block in the rendered configuration
    When s-consumes-c-models-only-in-models-yaml: TestRepositoryAndConfig runs against kogen-coordinator "v0.0.0-20261104081556-2a74649374bb"
    Then s-consumes-c-models-only-in-models-yaml: TestRepositoryAndConfig failed with "rendered configuration and template must not contain a models section; the lineup lives in .kogen/models.yaml"

  Scenario: Setup writes the producer's rendered configuration without trimming a models block
    Then s-consumes-c-models-only-in-models-yaml: no Go file trims the models template from a rendered configuration

  Scenario: The READMEs describe the configuration without a models section
    Then s-consumes-c-models-only-in-models-yaml: "contract/README.md" does not contain "without its models section"
    And s-consumes-c-models-only-in-models-yaml: "consumes/README.md" contains "neither the rendered configuration nor the template has a models section, the template loads with the team file present"
