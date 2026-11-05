Feature: Refuse test and lint runs in setup and fix, also behind assignments and wrappers

  Validate skips leading NAME=value assignments and the wrappers npx, bunx, pnpm exec, yarn, env
  and time before matching a command part against the recognised test and lint suites. It applies
  the test to setup (existing wording) and to fix commands
  ("fix command <part> runs tests or linting; put it in checks"). Checks may run tests.
  Formatters and installs stay accepted.

  Scenario: The request's setup examples are each refused
    When k-setup-tests-in-setup-or-fix-through-wrappers: Validate the proposal:
      """
      {"setup":["CI=1 npm test","npx jest","make test","time go test ./..."]}
      """
    Then k-setup-tests-in-setup-or-fix-through-wrappers: the problems are:
      """
      ["setup command CI=1 npm test runs tests or linting; put it in checks","setup command npx jest runs tests or linting; put it in checks","setup command make test runs tests or linting; put it in checks","setup command time go test ./... runs tests or linting; put it in checks"]
      """

  Scenario: The request's fix examples
    When k-setup-tests-in-setup-or-fix-through-wrappers: Validate the proposal:
      """
      {"fix":["go test ./...","gofmt -w .","mix format"]}
      """
    Then k-setup-tests-in-setup-or-fix-through-wrappers: the problems are:
      """
      ["fix command go test ./... runs tests or linting; put it in checks"]
      """

  Scenario: The request's accepted setup commands
    When k-setup-tests-in-setup-or-fix-through-wrappers: Validate the proposal:
      """
      {"setup":["npm ci","make build","go mod download"]}
      """
    Then k-setup-tests-in-setup-or-fix-through-wrappers: the problems are:
      """
      []
      """

  Scenario: Checks may run tests
    When k-setup-tests-in-setup-or-fix-through-wrappers: Validate the proposal:
      """
      {"checks":[{"name":"unit","run":"CI=1 npm test"},{"name":"jest","run":"npx jest"},{"name":"make","run":"make test"},{"name":"go","run":"time go test ./..."}]}
      """
    Then k-setup-tests-in-setup-or-fix-through-wrappers: the problems are:
      """
      []
      """

  Scenario Outline: Setup parts that run tests or linting are refused by name
    When k-setup-tests-in-setup-or-fix-through-wrappers: Validate "<command>" as setup
    Then k-setup-tests-in-setup-or-fix-through-wrappers: the problems are:
      """
      ["setup command <part> runs tests or linting; put it in checks"]
      """
    Examples:
      | command                          | part                             |
      | CI=1 npm test                    | CI=1 npm test                    |
      | npx jest                         | npx jest                         |
      | make test                        | make test                        |
      | time go test ./...               | time go test ./...               |
      | npx eslint .                     | npx eslint .                     |
      | bunx vitest run                  | bunx vitest run                  |
      | pnpm exec jest                   | pnpm exec jest                   |
      | yarn jest                        | yarn jest                        |
      | env CI=1 npm test                | env CI=1 npm test                |
      | CI=1 FORCE_COLOR=0 npx jest --ci | CI=1 FORCE_COLOR=0 npx jest --ci |
      | time make test                   | time make test                   |
      | make lint                        | make lint                        |
      | just test                        | just test                        |
      | jest                             | jest                             |
      | vitest run                       | vitest run                       |
      | eslint .                         | eslint .                         |
      | ruff check .                     | ruff check .                     |
      | tox                              | tox                              |
      | mvn test                         | mvn test                         |
      | gradle test                      | gradle test                      |
      | dotnet test                      | dotnet test                      |
      | phpunit                          | phpunit                          |
      | npm ci && CI=1 npm test          | CI=1 npm test                    |
      | yarn test                        | yarn test                        |

  Scenario Outline: Fix commands that run tests or linting are refused by name
    When k-setup-tests-in-setup-or-fix-through-wrappers: Validate "<command>" as fix
    Then k-setup-tests-in-setup-or-fix-through-wrappers: the problems are:
      """
      ["fix command <part> runs tests or linting; put it in checks"]
      """
    Examples:
      | command                    | part          |
      | go test ./...              | go test ./... |
      | CI=1 npm test              | CI=1 npm test |
      | npx eslint .               | npx eslint .  |
      | make lint                  | make lint     |
      | go vet ./...               | go vet ./...  |
      | gofmt -w . && go vet ./... | go vet ./...  |

  Scenario: Formatters, installs and unrelated longer words stay accepted
    When k-setup-tests-in-setup-or-fix-through-wrappers: Validate the proposal:
      """
      {"setup":["npm ci","make build","go mod download","CI=1 npm ci","env CI=1 npm ci","yarn install --frozen-lockfile","pnpm exec prisma generate","make testdata","just build"],"fix":["gofmt -w .","mix format","prettier --write .","npx prettier --write .","ruff format ."]}
      """
    Then k-setup-tests-in-setup-or-fix-through-wrappers: the problems are:
      """
      []
      """

  Scenario: Existing refusals keep their wording and order next to the new problems
    When k-setup-tests-in-setup-or-fix-through-wrappers: Validate the proposal:
      """
      {"setup":["npm test || true","CI=1 npm test"],"fix":["gofmt -w .","npx jest"],"checks":[{"name":"unit","run":"npx jest"}]}
      """
    Then k-setup-tests-in-setup-or-fix-through-wrappers: the problems are:
      """
      ["setup command npm test || true ignores its own failure","setup command npm test runs tests or linting; put it in checks","setup command CI=1 npm test runs tests or linting; put it in checks","fix command npx jest runs tests or linting; put it in checks"]
      """

  Scenario: Existing init tests stay green
    Then k-setup-tests-in-setup-or-fix-through-wrappers: existing init tests pass
