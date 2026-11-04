Feature: Normalize protection path spellings
  Scenario Outline: Validate and merge protection paths
    When k-setup-protect-path-spelling: observe <input>
    Then k-setup-protect-path-spelling: result equals <expected>

    Examples:
      | input | expected |
      | {"protect":["./config/.credo.exs"]} | {"protect":["config/.credo.exs"],"problems":[],"merged":["config/.credo.exs"]} |
      | {"protect":["/work/p/config/.credo.exs"]} | {"protect":["config/.credo.exs"],"problems":[],"merged":["config/.credo.exs"]} |
      | {"protect":["config/.credo.exs","./config/.credo.exs"]} | {"protect":["config/.credo.exs"],"problems":[],"merged":["config/.credo.exs"]} |
      | {"protect":["./mix.exs"]} | {"protect":["mix.exs"],"problems":[],"merged":["config/.credo.exs","mix.exs"]} |
      | {"protect":["config//.credo.exs/"]} | {"protect":["config/.credo.exs"],"problems":[],"merged":["config/.credo.exs"]} |
      | {"protect":["config//.credo.exs"]} | {"protect":["config/.credo.exs"],"problems":[],"merged":["config/.credo.exs"]} |
      | {"protect":["../other/.credo.exs"]} | {"protect":[],"problems":["protect path ../other/.credo.exs leaves the project folder"],"merged":[]} |
      | {"protect":["/etc/passwd"]} | {"protect":[],"problems":["protect path /etc/passwd leaves the project folder"],"merged":[]} |
      | {"protect":["config/../mix.exs"]} | {"protect":[],"problems":["protect path config/../mix.exs leaves the project folder"],"merged":[]} |
      | {"protect":["/work/peer/config/.credo.exs"]} | {"protect":[],"problems":["protect path /work/peer/config/.credo.exs leaves the project folder"],"merged":[]} |
      | {"protect":["config/missing.exs"]} | {"protect":[],"problems":["protect path config/missing.exs is not a tracked file"],"merged":[]} |
      | {"protect":["./config//missing.exs/"]} | {"protect":[],"problems":["protect path config/missing.exs is not a tracked file"],"merged":[]} |
      | {"mergeOnly":true,"protect":["./.credo.exs",".credo.exs","config//.credo.exs/"]} | {"protect":[],"problems":[],"merged":[".credo.exs","config/.credo.exs"]} |
