Feature: Drop empty entries from the protect path union
  Scenario Outline: Merge drops empty protect entries instead of injecting "."
    When fix-k-setup-protect-path-spelling: observe <input>
    Then fix-k-setup-protect-path-spelling: result equals <expected>

    Examples:
      | input | expected |
      | {"mergeOnly":true,"detected":[""],"protect":["mix.exs"]} | {"protect":[],"problems":[],"merged":["mix.exs"]} |
      | {"mergeOnly":true,"detected":[],"protect":[""]} | {"protect":[],"problems":[],"merged":[]} |
      | {"mergeOnly":true,"detected":["","config/.credo.exs"],"protect":["."]} | {"protect":[],"problems":[],"merged":["config/.credo.exs","."]} |
      | {"mergeOnly":true,"detected":["","./mix.exs"],"protect":["","mix.exs"]} | {"protect":[],"problems":[],"merged":["mix.exs"]} |

  Scenario Outline: Validate accepts []string and []any protect lists before merging with an empty detected entry
    When fix-k-setup-protect-path-spelling: observe <input>
    Then fix-k-setup-protect-path-spelling: result equals <expected>

    Examples:
      | input | expected |
      | {"listType":"string","detected":[""],"protect":["./config/.credo.exs"]} | {"protect":["config/.credo.exs"],"problems":[],"merged":["config/.credo.exs"]} |
      | {"listType":"any","detected":[""],"protect":["./config/.credo.exs"]} | {"protect":["config/.credo.exs"],"problems":[],"merged":["config/.credo.exs"]} |
