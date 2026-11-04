Feature: Refuse recurring repository mutations
  Scenario Outline: Refuse state changes
    When k-setup-refuse-git-state-commands: Validate <kind> command:
      """
      <command>
      """
    Then k-setup-refuse-git-state-commands: problems equal:
      """
      ["<problem> changes the repository state"]
      """
    Examples:
      | kind   | command                         | problem                                        |
      | setup  | git reset --hard && npm ci       | setup command git reset --hard && npm ci       |
      | checks | git stash; make test            | check a (git stash; make test)                  |
      | fix    | git clean -fdx                  | fix command git clean -fdx                     |
      | checks | git checkout -- .               | check a (git checkout -- .)                    |
      | setup  | git restore .                   | setup command git restore .                    |
      | fix    | git commit -am saved            | fix command git commit -am saved               |
      | checks | git rebase main                 | check a (git rebase main)                      |
      | setup  | git merge topic                 | setup command git merge topic                  |
      | fix    | git cherry-pick HEAD            | fix command git cherry-pick HEAD               |
      | checks | git tag v1                      | check a (git tag v1)                           |
      | setup  | git branch -D topic             | setup command git branch -D topic              |
      | fix    | git am x.patch                  | fix command git am x.patch                     |
      | checks | git apply x.patch               | check a (git apply x.patch)                    |
      | setup  | echo ok; git reset --hard       | setup command echo ok; git reset --hard        |
      | fix    | false \|\| git clean -fd        | fix command false \|\| git clean -fd           |
      | checks | cat x \| git stash             | check a (cat x \| git stash)                   |
      | fix    | git apply --check x; git apply y | fix command git apply --check x; git apply y   |
      | checks | git apply --check=x x.patch     | check a (git apply --check=x x.patch)           |

  Scenario: Split newlines
    When k-setup-refuse-git-state-commands: Validate checks command:
      """
      echo ok
      git reset --hard
      """
    Then k-setup-refuse-git-state-commands: problems equal:
      """
      ["check a (echo ok\ngit reset --hard) changes the repository state"]
      """

  Scenario Outline: Keep non-mutating Git proposals
    When k-setup-refuse-git-state-commands: Validate <kind> command:
      """
      <command>
      """
    Then k-setup-refuse-git-state-commands: problems equal:
      """
      []
      """
    Examples:
      | kind   | command                               |
      | checks | git diff --exit-code && make test     |
      | setup  | git submodule update --init           |
      | checks | git apply --check x.patch             |
      | setup  | git apply --check x.patch             |
      | fix    | git apply --check x.patch             |
      | checks | git status                            |
      | checks | git diff                              |
      | checks | git log                               |
      | checks | git rev-parse HEAD                     |
      | checks | git ls-files                          |
      | checks | git show                              |
      | checks | git describe                          |
