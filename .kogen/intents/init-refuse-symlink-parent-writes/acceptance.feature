Feature: Init refuses to write through a symlinked parent directory
  This feature runs the standalone setup command on temporary Git repositories in which a directory above a write target, or the write target itself, is a symbolic link to a place outside the checkout.

  Scenario: A symlinked .kogen with an absent write target is refused before any outside file is created
    Given init-refuse-symlink-parent-writes: a repository with a commit and an untracked symlink ".kogen" to an empty outside directory
    When init-refuse-symlink-parent-writes: init is run
    Then init-refuse-symlink-parent-writes: init is refused and the error names ".kogen" as a symbolic link
    And init-refuse-symlink-parent-writes: the outside directory contents and the symlink are unchanged
    And init-refuse-symlink-parent-writes: the repository state is unchanged

  Scenario: A committed symlinked .kogen is refused and nothing changes
    Given init-refuse-symlink-parent-writes: a repository whose only commit tracks the symlink ".kogen" to an outside directory containing the file "keep.txt"
    When init-refuse-symlink-parent-writes: init is run
    Then init-refuse-symlink-parent-writes: init is refused and the error names ".kogen" as a symbolic link
    And init-refuse-symlink-parent-writes: the outside directory contents and the symlink are unchanged
    And init-refuse-symlink-parent-writes: the repository state is unchanged

  Scenario: A symlinked final write target is still refused
    Given init-refuse-symlink-parent-writes: a repository with a commit and an untracked symlink ".gitignore" to a file in an outside directory
    When init-refuse-symlink-parent-writes: init is run
    Then init-refuse-symlink-parent-writes: init is refused and the error names ".gitignore" as a symbolic link
    And init-refuse-symlink-parent-writes: the outside directory contents and the symlink are unchanged
    And init-refuse-symlink-parent-writes: the repository state is unchanged

  Scenario: A regular .kogen directory still initializes and is committed
    Given init-refuse-symlink-parent-writes: a repository without commits, a regular file ".gitignore" containing "node_modules/" and an empty regular directory ".kogen"
    When init-refuse-symlink-parent-writes: init is run
    Then init-refuse-symlink-parent-writes: init succeeds with one commit that contains ".gitignore", ".kogen/project.yaml" and ".kogen/models.yaml"
    And init-refuse-symlink-parent-writes: the committed ".gitignore" still has the line "node_modules/"
