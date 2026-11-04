Feature: Redact whole credential values that contain colons
  Scenario Outline: A credential value after = that contains a colon is redacted whole
    When fix-k-setup-refuse-secret-literals: Validate <list> command:
      """
      <command>
      """
    Then fix-k-setup-refuse-secret-literals: problems equal:
      """
      ["<problem>"]
      """
    Examples:
      | list   | command                   | problem |
      | setup  | tool --password=abc:def   | setup command tool --password=*** contains a credential literal; read it from the environment instead |
      | fix    | tool --password=abc:def   | fix command tool --password=*** contains a credential literal; read it from the environment instead |
      | checks | tool --password=abc:def   | check command tool --password=*** contains a credential literal; read it from the environment instead |
      | setup  | NAME_TOKEN=user:pass      | setup command NAME_TOKEN=*** contains a credential literal; read it from the environment instead |
      | fix    | NAME_TOKEN=user:pass      | fix command NAME_TOKEN=*** contains a credential literal; read it from the environment instead |
      | checks | NAME_TOKEN=user:pass      | check command NAME_TOKEN=*** contains a credential literal; read it from the environment instead |
      | fix    | NAME_TOKEN=user:pass tool | fix command NAME_TOKEN=*** tool contains a credential literal; read it from the environment instead |
      | fix    | tool --password='abc:def' | fix command tool --password='***' contains a credential literal; read it from the environment instead |
      | checks | API_KEY=a:b:c make test   | check command API_KEY=*** make test contains a credential literal; read it from the environment instead |

  Scenario Outline: Headers and separate name/value words keep redacting colon-bearing values whole
    When fix-k-setup-refuse-secret-literals: Validate <list> command:
      """
      <command>
      """
    Then fix-k-setup-refuse-secret-literals: problems equal:
      """
      ["<problem>"]
      """
    Examples:
      | list   | command | problem |
      | checks | curl -H "Authorization: Bearer abc:def" https://api.invalid/health | check command curl -H \"Authorization: Bearer ***\" https://api.invalid/health contains a credential literal; read it from the environment instead |
      | setup  | curl -H "Authorization: Bearer a=b" https://api.invalid/health | setup command curl -H \"Authorization: Bearer ***\" https://api.invalid/health contains a credential literal; read it from the environment instead |
      | fix    | tool --token abc:def | fix command tool --token *** contains a credential literal; read it from the environment instead |
