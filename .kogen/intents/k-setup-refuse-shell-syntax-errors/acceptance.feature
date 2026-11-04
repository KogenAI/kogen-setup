Feature: Refuse shell syntax errors before init verification
  Scenario: Validate the supplied malformed commands and valid counterexamples
    When k-setup-refuse-shell-syntax-errors: Validate these commands:
      | list  | command                              | result   |
      | setup | echo "unterminated                   | refused  |
      | check | go test ./... &&                     | refused  |
      | fix   | if true; then echo x                 | refused  |
      | check | echo $(date                         | refused  |
      | check | go test ./... \|                     | refused  |
      | setup | touch marker; echo "x                | refused  |
      | setup | npm ci                              | accepted |
      | check | go test ./... \| tail -n 5            | accepted |
      | check | nonexistent-program --flag          | accepted |
      | fix   | gofmt -l -w .                       | accepted |
      | check | cat nonexistent-file               | accepted |
      | setup | touch marker                        | accepted |
    Then k-setup-refuse-shell-syntax-errors: the problems match the shell first line and no marker exists

  Scenario: The parser receives only parse arguments with an empty environment outside the project
    When k-setup-refuse-shell-syntax-errors: Validate with shell mode recording
    Then k-setup-refuse-shell-syntax-errors: the shell isolation result matches

  Scenario: An unavailable shell does not add a validation problem
    When k-setup-refuse-shell-syntax-errors: Validate with shell mode missing
    Then k-setup-refuse-shell-syntax-errors: the shell isolation result matches

  Scenario: Init sends a malformed command back rather than verifying it
    When k-setup-refuse-shell-syntax-errors: Init receives the malformed fix:
      """
      touch marker; echo "x
      """
    Then k-setup-refuse-shell-syntax-errors: Init observations equal:
      """
      {"requests":2,"config":"","status":"","verified":false}
      """
