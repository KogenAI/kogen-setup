Feature: Init refuses to write through a symlink at a file it writes
  This feature runs the standalone setup command on temporary Git repositories whose write targets are symlinks to files outside the checkout.

  Scenario: A symlinked .gitignore is refused before any setup file is written
    Given init-refuse-symlink-write-targets: a repository without commits and an untracked symlink ".gitignore" to an outside file containing "outside"
    When init-refuse-symlink-write-targets: init is run
    Then init-refuse-symlink-write-targets: init is refused and the error names ".gitignore"
    And init-refuse-symlink-write-targets: no setup file was written
    And init-refuse-symlink-write-targets: the outside file and the symlink are unchanged
    And init-refuse-symlink-write-targets: the repository state is unchanged

  Scenario: A committed symlinked .gitignore is refused and nothing changes
    Given init-refuse-symlink-write-targets: a repository whose only commit tracks the symlink ".gitignore" to an outside file containing "outside"
    When init-refuse-symlink-write-targets: init is run
    Then init-refuse-symlink-write-targets: init is refused and the error names ".gitignore"
    And init-refuse-symlink-write-targets: the outside file and the symlink are unchanged
    And init-refuse-symlink-write-targets: the repository state is unchanged

  Scenario: A committed symlinked models file that init would create is refused and nothing changes
    Given init-refuse-symlink-write-targets: a repository whose only commit tracks the symlink ".kogen/models.yaml" to a missing outside file
    When init-refuse-symlink-write-targets: init is run
    Then init-refuse-symlink-write-targets: init is refused and the error names ".kogen/models.yaml"
    And init-refuse-symlink-write-targets: the outside file and the symlink are unchanged
    And init-refuse-symlink-write-targets: the repository state is unchanged

  Scenario: Regular files still initialize and are committed
    Given init-refuse-symlink-write-targets: a repository without commits and a regular file ".gitignore" containing "node_modules/"
    When init-refuse-symlink-write-targets: init is run
    Then init-refuse-symlink-write-targets: init succeeds with one commit that contains ".gitignore", ".kogen/project.yaml" and ".kogen/models.yaml"
    And init-refuse-symlink-write-targets: the committed ".gitignore" still has the line "node_modules/"
