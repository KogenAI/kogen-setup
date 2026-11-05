Feature: k-setup-models-file: Store init lineups with the coordinator
  Scenario: Initial and repeat init use the team file
    Then k-setup-models-file: this command succeeds
      """
      set -eu
      base=$(mktemp -d)
      trap 'rm -rf "$base"' EXIT
      go build -o "$base/setup" ./cmd/kogen-setup
      mkdir "$base/repo" "$base/home"
      export HOME="$base/home" GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
      unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE
      cd "$base/repo"
      git init -q
      git config user.name Fixture
      git config user.email fixture@example.invalid
      git config commit.gpgsign false
      git config core.hooksPath /dev/null
      "$base/setup" "$PWD"
      test -f .kogen/models.yaml
      grep -q '^models:$' .kogen/models.yaml
      if grep -q '^models:' .kogen/project.yaml; then exit 1; fi
      test "$(git rev-list --count HEAD)" = 1
      git show HEAD:.kogen/models.yaml > "$base/committed"
      cmp .kogen/models.yaml "$base/committed"
      test -z "$(git status --porcelain)"
      printf 'models:\n  shape:\n    model: gpt-6.1-sol\n    effort: low\n' > .kogen/models.yaml
      git add .kogen/models.yaml
      git commit -qm 'Select team shape model'
      cp .kogen/models.yaml "$base/team"
      head=$(git rev-parse HEAD)
      "$base/setup" "$PWD"
      cmp .kogen/models.yaml "$base/team"
      test "$(git rev-parse HEAD)" = "$head"
      test -z "$(git status --porcelain)"
      """

  Scenario: Preserve the existing setup and contract suite
    Then k-setup-models-file: this command succeeds
      """
      go test -count=1 ./setup ./contract ./consumes/...
      """
