Feature: Refuse credential literals without echoing them
  Scenario Outline: Named credentials and URL passwords are refused
    When k-setup-refuse-secret-literals: Validate <list> command:
      """
      <command>
      """
    Then k-setup-refuse-secret-literals: problems equal:
      """
      ["<problem>"]
      """
    Examples:
      | list   | command | problem |
      | setup | npm config set //registry.invalid/:_authToken=abc123def | setup command npm config set //registry.invalid/:_authToken=*** contains a credential literal; read it from the environment instead |
      | checks | curl -H "Authorization: Bearer abc123" https://api.invalid/health | check command curl -H \"Authorization: Bearer ***\" https://api.invalid/health contains a credential literal; read it from the environment instead |
      | setup | git clone https://bot:hunter2@git.invalid/x.git deps/x | setup command git clone https://bot:***@git.invalid/x.git deps/x contains a credential literal; read it from the environment instead |
      | fix | tool --token=abc123 | fix command tool --token=*** contains a credential literal; read it from the environment instead |
      | checks | tool --password hunter2 | check command tool --password *** contains a credential literal; read it from the environment instead |
      | setup | NAME_TOKEN=abc123 tool | setup command NAME_TOKEN=*** tool contains a credential literal; read it from the environment instead |
      | fix | API_KEY=abc123 tool | fix command API_KEY=*** tool contains a credential literal; read it from the environment instead |
      | fix | tool --secret abc123 | fix command tool --secret *** contains a credential literal; read it from the environment instead |
      | fix | tool --passwd hunter2 | fix command tool --passwd *** contains a credential literal; read it from the environment instead |
      | fix | tool --api-key abc123 | fix command tool --api-key *** contains a credential literal; read it from the environment instead |
      | fix | tool --authorization abc123 | fix command tool --authorization *** contains a credential literal; read it from the environment instead |
      | fix | tool --bearer abc123 | fix command tool --bearer *** contains a credential literal; read it from the environment instead |

  Scenario Outline: Safe commands remain accepted
    When k-setup-refuse-secret-literals: Validate <list> command:
      """
      <command>
      """
    Then k-setup-refuse-secret-literals: problems equal:
      """
      []
      """
    Examples:
      | list | command |
      | setup | npm config set //registry.invalid/:_authToken=$NPM_TOKEN |
      | checks | API_KEY= make test |
      | setup | npm ci |
      | fix | tool --token=${API_KEY} |
      | fix | tool --password "$NPM_TOKEN" |
      | fix | tool abc123def |

  Scenario Outline: Inspect every command part
    When k-setup-refuse-secret-literals: Validate fix command:
      """
      tool<separator>tool --token=abc123
      """
    Then k-setup-refuse-secret-literals: problems equal:
      """
      ["fix command tool<separator>tool --token=*** contains a credential literal; read it from the environment instead"]
      """
    Examples:
      | separator |
      | ; |
      | && |
      | \|\| |
      | \| |

  Scenario: Inspect newline parts without leaking through control-character diagnostics
    When k-setup-refuse-secret-literals: Validate fix command:
      """
      tool
      tool --token=abc123
      """
    Then k-setup-refuse-secret-literals: problems equal:
      """
      ["fix command tool\ntool --token=*** contains a credential literal; read it from the environment instead"]
      """
