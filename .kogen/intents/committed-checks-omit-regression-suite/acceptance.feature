Feature: committed-checks-omit-regression-suite: Report detected checks the accepted configuration leaves out

  Scenario: A committed Go configuration with only vet reports the detected checks it leaves out
    Given committed-checks-omit-regression-suite: a repository with these committed files:
      """
      {"go.mod": "module example.com/fixture\n\ngo 1.22\n", "README.md": "Synthetic fixture.\n"}
      """
    And committed-checks-omit-regression-suite: its configuration is committed:
      """
      {"setup": [], "checks": [{"name": "vet", "run": "go vet ./..."}]}
      """
    When committed-checks-omit-regression-suite: kogen-setup runs on that repository
    Then committed-checks-omit-regression-suite: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Note: detected check go-format (test -z "$(gofmt -l .)") is not in the configured checks
      Note: detected check go-test (go test ./...) is not in the configured checks
      Note: detected check go-build (go build -o /dev/null ./...) is not in the configured checks
      Next: set commands.acceptance in .kogen/project.yaml
      """

  Scenario: The detected test command configured under another name prints no Note for it
    Given committed-checks-omit-regression-suite: a repository with these committed files:
      """
      {"go.mod": "module example.com/fixture\n\ngo 1.22\n", "README.md": "Synthetic fixture.\n"}
      """
    And committed-checks-omit-regression-suite: its configuration is committed:
      """
      {"setup": [], "checks": [{"name": "vet", "run": "go vet ./..."}, {"name": "unit", "run": "go test ./..."}]}
      """
    When committed-checks-omit-regression-suite: kogen-setup runs on that repository
    Then committed-checks-omit-regression-suite: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Note: detected check go-format (test -z "$(gofmt -l .)") is not in the configured checks
      Note: detected check go-build (go build -o /dev/null ./...) is not in the configured checks
      Next: set commands.acceptance in .kogen/project.yaml
      """

  Scenario: The detected test command with extra spaces between words prints no Note for it
    Given committed-checks-omit-regression-suite: a repository with these committed files:
      """
      {"go.mod": "module example.com/fixture\n\ngo 1.22\n", "README.md": "Synthetic fixture.\n"}
      """
    And committed-checks-omit-regression-suite: its configuration is committed:
      """
      {"setup": [], "checks": [{"name": "vet", "run": "go vet ./..."}, {"name": "suite", "run": "go   test    ./..."}]}
      """
    When committed-checks-omit-regression-suite: kogen-setup runs on that repository
    Then committed-checks-omit-regression-suite: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Note: detected check go-format (test -z "$(gofmt -l .)") is not in the configured checks
      Note: detected check go-build (go build -o /dev/null ./...) is not in the configured checks
      Next: set commands.acceptance in .kogen/project.yaml
      """

  Scenario: A configured check with the detected name but a different command still gets the Note
    Given committed-checks-omit-regression-suite: a repository with these committed files:
      """
      {"go.mod": "module example.com/fixture\n\ngo 1.22\n", "README.md": "Synthetic fixture.\n"}
      """
    And committed-checks-omit-regression-suite: its configuration is committed:
      """
      {"setup": [], "checks": [{"name": "vet", "run": "go vet ./..."}, {"name": "go-test", "run": "GOFLAGS=-trimpath go test ./..."}]}
      """
    When committed-checks-omit-regression-suite: kogen-setup runs on that repository
    Then committed-checks-omit-regression-suite: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Note: detected check go-format (test -z "$(gofmt -l .)") is not in the configured checks
      Note: detected check go-test (go test ./...) is not in the configured checks
      Note: detected check go-build (go build -o /dev/null ./...) is not in the configured checks
      Next: set commands.acceptance in .kogen/project.yaml
      """

  Scenario: A committed configuration with no checks and a detected test prints one Note and the no-checks Next line
    Given committed-checks-omit-regression-suite: a repository with these committed files:
      """
      {"package.json": "{\"name\": \"fixture\", \"scripts\": {\"test\": \"node test.js\"}}\n", "README.md": "Synthetic fixture.\n"}
      """
    And committed-checks-omit-regression-suite: its configuration is committed:
      """
      {"setup": [], "checks": []}
      """
    When committed-checks-omit-regression-suite: kogen-setup runs on that repository
    Then committed-checks-omit-regression-suite: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Note: detected check test (npm run test) is not in the configured checks
      Next: set commands.acceptance in .kogen/project.yaml
      Next: add the project's checks to commands.checks in .kogen/project.yaml
      """

  Scenario: A project with no manifests prints no detected-check Note
    Given committed-checks-omit-regression-suite: a repository with these committed files:
      """
      {"README.md": "Synthetic fixture.\n"}
      """
    And committed-checks-omit-regression-suite: its configuration is committed:
      """
      {"setup": [], "checks": []}
      """
    When committed-checks-omit-regression-suite: kogen-setup runs on that repository
    Then committed-checks-omit-regression-suite: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Next: set commands.acceptance in .kogen/project.yaml
      Next: add the project's checks to commands.checks in .kogen/project.yaml
      """

  Scenario: The leftover-commit path prints the same notes before the Next lines, and a second run repeats them
    Given committed-checks-omit-regression-suite: a repository with these committed files:
      """
      {"go.mod": "module example.com/fixture\n\ngo 1.22\n", "README.md": "Synthetic fixture.\n"}
      """
    And committed-checks-omit-regression-suite: its configuration is written but not committed:
      """
      {"setup": [], "checks": [{"name": "vet", "run": "go vet ./..."}]}
      """
    When committed-checks-omit-regression-suite: kogen-setup runs on that repository
    Then committed-checks-omit-regression-suite: the run commits the configuration unchanged in one new commit, leaves Git status clean, and its output is:
      """
      Initialized Kogen in <root>
      Commit: <commit> Add Kogen configuration
      Note: detected check go-format (test -z "$(gofmt -l .)") is not in the configured checks
      Note: detected check go-test (go test ./...) is not in the configured checks
      Note: detected check go-build (go build -o /dev/null ./...) is not in the configured checks
      Next: set commands.acceptance in .kogen/project.yaml
      """
    When committed-checks-omit-regression-suite: kogen-setup runs on that repository
    Then committed-checks-omit-regression-suite: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Note: detected check go-format (test -z "$(gofmt -l .)") is not in the configured checks
      Note: detected check go-test (go test ./...) is not in the configured checks
      Note: detected check go-build (go build -o /dev/null ./...) is not in the configured checks
      Next: set commands.acceptance in .kogen/project.yaml
      """
    And committed-checks-omit-regression-suite: the last two runs print byte-identical Note lines

  Scenario: The leftover-commit path also prints the bootstrap and cannot-fail notes, in the same order as a later run
    Given committed-checks-omit-regression-suite: a repository with these committed files:
      """
      {"go.mod": "module example.com/fixture\n\ngo 1.22\n", "README.md": "Synthetic fixture.\n"}
      """
    And committed-checks-omit-regression-suite: its configuration is written but not committed:
      """
      {"setup": ["mix local.hex --force"], "checks": [{"name": "vet", "run": "go vet ./..."}, {"name": "smoke", "run": "true"}, {"name": "lint", "run": "npm test || true"}]}
      """
    When committed-checks-omit-regression-suite: kogen-setup runs on that repository
    Then committed-checks-omit-regression-suite: the run commits the configuration unchanged in one new commit, leaves Git status clean, and its output is:
      """
      Initialized Kogen in <root>
      Commit: <commit> Add Kogen configuration
      Note: setup command (mix local.hex --force) looks like a one-time machine bootstrap
      Note: check smoke (true) cannot fail: runs nothing
      Note: check lint (npm test || true) cannot fail: masks its failure
      Note: detected check go-format (test -z "$(gofmt -l .)") is not in the configured checks
      Note: detected check go-test (go test ./...) is not in the configured checks
      Note: detected check go-build (go build -o /dev/null ./...) is not in the configured checks
      Next: set commands.acceptance in .kogen/project.yaml
      """
    When committed-checks-omit-regression-suite: kogen-setup runs on that repository
    Then committed-checks-omit-regression-suite: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Note: setup command (mix local.hex --force) looks like a one-time machine bootstrap
      Note: check smoke (true) cannot fail: runs nothing
      Note: check lint (npm test || true) cannot fail: masks its failure
      Note: detected check go-format (test -z "$(gofmt -l .)") is not in the configured checks
      Note: detected check go-test (go test ./...) is not in the configured checks
      Note: detected check go-build (go build -o /dev/null ./...) is not in the configured checks
      Next: set commands.acceptance in .kogen/project.yaml
      """
    And committed-checks-omit-regression-suite: the last two runs print byte-identical Note lines

  Scenario: A sound configuration covering every detected check prints no Note on the already-initialized path
    Given committed-checks-omit-regression-suite: a repository with these committed files:
      """
      {"go.mod": "module example.com/fixture\n\ngo 1.22\n", "README.md": "Synthetic fixture.\n"}
      """
    And committed-checks-omit-regression-suite: its configuration is committed:
      """
      {"setup": ["go mod download"], "checks": [{"name": "format", "run": "test -z \"$(gofmt -l .)\""}, {"name": "test", "run": "go test ./..."}, {"name": "vet", "run": "go vet ./..."}, {"name": "build", "run": "go build -o /dev/null ./..."}]}
      """
    When committed-checks-omit-regression-suite: kogen-setup runs on that repository
    Then committed-checks-omit-regression-suite: the run succeeds without changing the working tree or HEAD, and its output is:
      """
      Kogen is already initialized in <root>
      Next: set commands.acceptance in .kogen/project.yaml
      """

  Scenario: A sound configuration covering every detected check prints no Note on the leftover-commit path
    Given committed-checks-omit-regression-suite: a repository with these committed files:
      """
      {"go.mod": "module example.com/fixture\n\ngo 1.22\n", "README.md": "Synthetic fixture.\n"}
      """
    And committed-checks-omit-regression-suite: its configuration is written but not committed:
      """
      {"setup": ["go mod download"], "checks": [{"name": "format", "run": "test -z \"$(gofmt -l .)\""}, {"name": "test", "run": "go test ./..."}, {"name": "vet", "run": "go vet ./..."}, {"name": "build", "run": "go build -o /dev/null ./..."}]}
      """
    When committed-checks-omit-regression-suite: kogen-setup runs on that repository
    Then committed-checks-omit-regression-suite: the run commits the configuration unchanged in one new commit, leaves Git status clean, and its output is:
      """
      Initialized Kogen in <root>
      Commit: <commit> Add Kogen configuration
      Next: set commands.acceptance in .kogen/project.yaml
      """
