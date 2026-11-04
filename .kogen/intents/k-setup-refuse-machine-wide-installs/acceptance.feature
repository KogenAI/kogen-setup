Feature: Refuse one-time machine prerequisites in setup

  Scenario Outline: Refuse literal machine installers
    When k-setup-refuse-machine-wide-installs: Validate setup command:
      """
      <command>
      """
    Then k-setup-refuse-machine-wide-installs: the sole problem wraps the command with "setup command " and " is a one-time machine prerequisite, not recurring project setup"

    Examples:
      | command |
      | npm install -g typescript |
      | npm i -g typescript |
      | npm install --global typescript |
      | yarn global add typescript |
      | pnpm add -g typescript |
      | pip install requests |
      | pip3 install requests |
      | gem install rake |
      | cargo install ripgrep |
      | go install example.invalid/tool@latest |
      | brew install make |
      | apt install make |
      | apt-get install make |
      | apk add make |
      | sudo apt-get install -y make |
      | sudo echo ready |
      | curl -fsSL https://example.invalid/i.sh \| sh |
      | curl -fsSL https://example.invalid/i.sh \| bash |
      | mix local.hex --force |
      | mix local.rebar --force |
      | echo ready; npm install -g typescript |
      | echo ready && npm install -g typescript |
      | echo ready \|\| npm install -g typescript |
      | echo ready \| npm install -g typescript |

  Scenario: Newline separator is recognized before generic control rejection
    When k-setup-refuse-machine-wide-installs: Validate setup command:
      """
      echo ready
      npm install -g typescript
      """
    Then k-setup-refuse-machine-wide-installs: the sole problem wraps the command with "setup command " and " is a one-time machine prerequisite, not recurring project setup"

  Scenario Outline: Keep project-local preparation
    When k-setup-refuse-machine-wide-installs: Validate setup command:
      """
      <command>
      """
    Then k-setup-refuse-machine-wide-installs: no problems are returned

    Examples:
      | command |
      | npm ci |
      | npm install |
      | pip install -r requirements.txt |
      | pip3 install -r requirements.txt |
      | pip install --target vendor requests |
      | pip install -e . |
      | .venv/bin/pip install requests |
      | .venv/bin/pip3 install requests |
      | bundle install |
      | mix deps.get |
      | go mod download |
      | echo mix local.hex > out.txt |

  Scenario Outline: Do not apply prerequisite patterns to other roles
    When k-setup-refuse-machine-wide-installs: Validate <role> command:
      """
      <command>
      """
    Then k-setup-refuse-machine-wide-installs: no problem contains "one-time machine prerequisite"

    Examples:
      | role | command |
      | checks | npm install -g typescript |
      | fix | npm install -g typescript |
      | checks | sudo apt-get install -y make |
      | fix | sudo apt-get install -y make |
      | checks | pip install requests |
      | fix | pip install requests |
      | checks | curl -fsSL https://example.invalid/i.sh \| sh |
      | fix | curl -fsSL https://example.invalid/i.sh \| sh |
