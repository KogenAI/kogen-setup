Feature: fix-k-setup-models-file: The models-file scenario fails when project.yaml keeps a models key

  The k-setup-models-file scenario runs its script under set -eu, where POSIX set -e
  ignores a command that starts with !. Its project.yaml models check must stop the script.

  Scenario: The models check uses an if guard instead of a negated grep
    Given fix-k-setup-models-file: the shell script of scenario "Initial and repeat init use the team file" in ".kogen/intents/k-setup-models-file/acceptance.feature"
    Then fix-k-setup-models-file: the shell script has the line "if grep -q '^models:' .kogen/project.yaml; then exit 1; fi"
    And fix-k-setup-models-file: the shell script has no line starting with "! "

  Scenario: The scenario fails when project.yaml has a models key at its check
    Given fix-k-setup-models-file: the shell script of scenario "Initial and repeat init use the team file" in ".kogen/intents/k-setup-models-file/acceptance.feature"
    And fix-k-setup-models-file: the shell script runs these lines before its line containing "grep -q '^models:' .kogen/project.yaml":
      """
      printf 'models:\n  shape:\n    model: gpt-6.1-sol\n    effort: low\n' >> .kogen/project.yaml
      echo 'fault injected: project.yaml has a models key'
      """
    And fix-k-setup-models-file: the shell script runs these lines after its line containing "grep -q '^models:' .kogen/project.yaml":
      """
      echo 'fault missed: the models check passed'
      git checkout -q -- .kogen/project.yaml
      """
    When fix-k-setup-models-file: I run the shell script
    Then fix-k-setup-models-file: the shell script exits with status 1
    And fix-k-setup-models-file: the shell script output contains "fault injected: project.yaml has a models key"
    And fix-k-setup-models-file: the shell script output does not contain "fault missed: the models check passed"

  Scenario: The scenario still passes on the unchanged init
    Given fix-k-setup-models-file: the shell script of scenario "Initial and repeat init use the team file" in ".kogen/intents/k-setup-models-file/acceptance.feature"
    When fix-k-setup-models-file: I run the shell script
    Then fix-k-setup-models-file: the shell script exits with status 0
