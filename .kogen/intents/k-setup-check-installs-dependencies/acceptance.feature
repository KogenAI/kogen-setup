Feature: Keep dependency installation out of checks
  Scenario Outline: Refuse literal dependency installers
    When k-setup-check-installs-dependencies: Validate proposal:
      """
      {"checks":[{"name":"suite","run":"<command>"}]}
      """
    Then k-setup-check-installs-dependencies: problems equal:
      """
      ["check suite (<command>) installs dependencies; put the install in setup"]
      """
    Examples:
      | command |
      | npm ci && npm test |
      | mix deps.get; mix test |
      | pip install -r requirements.txt && pytest |
      | bundle install && rspec |
      | npm install |
      | npm i |
      | yarn install |
      | yarn |
      | pnpm install |
      | pip3 install |
      | python -m pip install |
      | go mod download |
      | cargo fetch |
      | composer install |
      | poetry install |
      | uv sync |
      | npm test && npm ci |
      | npm test \|\| npm ci |
      | npm ci \| cat |

  Scenario Outline: Accept noninstalling checks
    When k-setup-check-installs-dependencies: Validate proposal:
      """
      {"checks":[{"name":"suite","run":"<command>"}]}
      """
    Then k-setup-check-installs-dependencies: problems equal:
      """
      []
      """
    Examples:
      | command |
      | go mod verify && go test ./... |
      | npm ls |
      | pip check |
      | mix deps |
      | echo npm ci |
      | printf 'npm ci' |
      | my-npm install |
      | npm install-extra |
      | yarn test |
      | cat file \| npm ci |

  Scenario: Leave setup and fix installation alone
    When k-setup-check-installs-dependencies: Validate proposal:
      """
      {"setup":["npm ci"],"fix":["npm ci"],"checks":[{"name":"suite","run":"npm test"}]}
      """
    Then k-setup-check-installs-dependencies: problems equal:
      """
      []
      """

  Scenario: Recognize newline-separated installation without removing control validation
    When k-setup-check-installs-dependencies: Validate proposal:
      """
      {"checks":[{"name":"suite","run":"npm test\nnpm ci"}]}
      """
    Then k-setup-check-installs-dependencies: problems equal:
      """
      ["check suite command \"npm test\\nnpm ci\" contains a control character; put one command per entry","check suite (npm test\nnpm ci) installs dependencies; put the install in setup"]
      """
