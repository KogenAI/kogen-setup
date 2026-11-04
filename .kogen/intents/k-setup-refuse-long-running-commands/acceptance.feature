Feature: Refuse long-running proposals before execution

  Scenario: Synthetic checks name both offenders
    When k-setup-refuse-long-running-commands: Validate arguments:
      """
      {"checks":[{"name":"a","run":"npx jest --watch"},{"name":"b","run":"mix phx.server"}]}
      """
    Then k-setup-refuse-long-running-commands: all problems equal:
      """
      ["check a (npx jest --watch) does not exit on its own (watch or server mode); use a command that runs once","check b (mix phx.server) does not exit on its own (watch or server mode); use a command that runs once"]
      """

  Scenario: Refuse recurring dev setup
    When k-setup-refuse-long-running-commands: Validate arguments:
      """
      {"setup":["npm run dev"]}
      """
    Then k-setup-refuse-long-running-commands: all problems equal:
      """
      ["setup command npm run dev does not exit on its own (watch or server mode); use a command that runs once"]
      """

  Scenario Outline: Recognize literal long-running parts
    When k-setup-refuse-long-running-commands: Validate arguments:
      """
      {"checks":[{"name":"a","run":"<command>"}]}
      """
    Then k-setup-refuse-long-running-commands: long-running problems equal:
      """
      ["check a (<command>) does not exit on its own (watch or server mode); use a command that runs once"]
      """
    Examples:
      | command |
      | jest --watchAll |
      | vitest -w |
      | mocha --watch |
      | tsc --watch |
      | mix test --watch |
      | mix test.watch |
      | npm start |
      | npm run dev |
      | npm run serve |
      | yarn start |
      | yarn dev |
      | pnpm dev |
      | rails server |
      | rails s |
      | flask run |
      | python -m http.server |
      | docker compose up |
      | docker-compose up |
      | tail -f log.txt |
      | sleep 61 |
      | sleep 2m |
      | echo ok; npm start |
      | echo ok && npm start |
      | false \|\| npm start |
      | echo ok\\nnpm start |
      | npm start \| cat |

  Scenario Outline: Distinguish one-shot commands and unrelated words from watch mode
    When k-setup-refuse-long-running-commands: Validate arguments:
      """
      {"checks":[{"name":"a","run":"npx jest --watch"},{"name":"c","run":"<command>"}],"setup":["npm ci","docker compose up -d"],"fix":["npm run dev"]}
      """
    Then k-setup-refuse-long-running-commands: all problems equal:
      """
      ["check a (npx jest --watch) does not exit on its own (watch or server mode); use a command that runs once"<extra>]
      """
    Examples:
      | command | extra |
      | npx vitest run | |
      | npm run build | |
      | docker compose up -d | |
      | docker-compose up --detach | |
      | sleep 60 | |
      | sleep 59 | |
      | echo npm run dev | ,"check c (echo npm run dev) runs nothing" |
      | echo jest --watch | ,"check c (echo jest --watch) runs nothing" |
      | jest --watchman | |

  Scenario: Preserve existing init verification and correction behavior
    Then k-setup-refuse-long-running-commands: existing init tests pass
