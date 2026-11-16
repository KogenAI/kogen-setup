Feature: Init refusals name the uncommitted paths
  This feature checks the two init refusals that happen before any configuration is written, on temporary Git repositories with files at the repository root only.

  Scenario: Two dirty files are both named
    Given setup-init-refusals-name-the-uncommitted-paths: a repository whose only commit contains the file "README.md"
    And setup-init-refusals-name-the-uncommitted-paths: the files ".gitignore, features/steps/README.md" are written with the content "changed"
    When setup-init-refusals-name-the-uncommitted-paths: kogen init is run
    Then setup-init-refusals-name-the-uncommitted-paths: init is refused as "environment" with reason "dirty_tree" and exit code 5
    Then setup-init-refusals-name-the-uncommitted-paths: the refusal detail is:
      """
      .gitignore, features/steps/README.md have uncommitted changes; commit, stash or discard them first
      """

  Scenario: Seven uncommitted files are bounded
    Given setup-init-refusals-name-the-uncommitted-paths: a repository without commits
    And setup-init-refusals-name-the-uncommitted-paths: the files "f1.txt, f2.txt, f3.txt, f4.txt, f5.txt, f6.txt, f7.txt" are written with the content "x"
    When setup-init-refusals-name-the-uncommitted-paths: kogen init is run
    Then setup-init-refusals-name-the-uncommitted-paths: init is refused as "environment" with reason "no_commits" and exit code 3
    Then setup-init-refusals-name-the-uncommitted-paths: the refusal detail is:
      """
      7 file(s) are not committed yet (f1.txt, f2.txt, f3.txt, f4.txt, f5.txt and 2 more); commit them first (git add -A && git commit -m "Initial commit"), then run kogen init
      """

  Scenario: A short list is named in full and .gitignore is left out
    Given setup-init-refusals-name-the-uncommitted-paths: a repository without commits
    And setup-init-refusals-name-the-uncommitted-paths: the files "a.txt, b.txt, .gitignore" are written with the content "x"
    When setup-init-refusals-name-the-uncommitted-paths: kogen init is run
    Then setup-init-refusals-name-the-uncommitted-paths: init is refused as "environment" with reason "no_commits" and exit code 3
    Then setup-init-refusals-name-the-uncommitted-paths: the refusal detail is:
      """
      2 file(s) are not committed yet (a.txt, b.txt); commit them first (git add -A && git commit -m "Initial commit"), then run kogen init
      """
