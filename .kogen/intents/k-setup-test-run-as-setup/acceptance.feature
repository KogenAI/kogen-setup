Feature: Keep tests and lint out of recurring setup
  Scenario Outline: Refuse literal suites
    When k-setup-test-run-as-setup: Validate "<command>" as setup
    Then k-setup-test-run-as-setup: problems equal:
      """
      ["setup command <part> runs tests or linting; put it in checks"]
      """
    Examples:
      | command                    | part                  |
      | mix deps.get && mix test    | mix test              |
      | go test ./...              | go test ./...         |
      | mix test                   | mix test              |
      | go vet                     | go vet                |
      | npm test                   | npm test              |
      | npm run test               | npm run test          |
      | npm run lint               | npm run lint          |
      | yarn test                  | yarn test             |
      | pnpm test                  | pnpm test             |
      | pytest                     | pytest                |
      | python -m pytest           | python -m pytest      |
      | cargo test                 | cargo test            |
      | cargo clippy               | cargo clippy          |
      | bundle exec rspec          | bundle exec rspec     |
      | rspec                      | rspec                 |
      | rake test                  | rake test             |
      | npm ci; npm test           | npm test              |

  Scenario: Split alternative commands
    When k-setup-test-run-as-setup: Validate "npm ci || npm run lint" as setup
    Then k-setup-test-run-as-setup: problems equal:
      """
      ["setup command npm run lint runs tests or linting; put it in checks"]
      """

  Scenario Outline: Preserve eligible commands and other roles
    When k-setup-test-run-as-setup: Validate "<command>" as <role>
    Then k-setup-test-run-as-setup: problems equal:
      """
      []
      """
    Examples:
      | command             | role   |
      | npm ci              | setup  |
      | mix deps.get        | setup  |
      | mix compile         | setup  |
      | go mod download     | setup  |
      | cargo fetch         | setup  |
      | echo mix test       | setup  |
      | npm run testing     | setup  |
      | mix testing         | setup  |
      | python -m pytestfoo | setup  |
      | go test ./...       | checks |
