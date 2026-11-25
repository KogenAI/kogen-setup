Feature: Reject remote Git actions in proposed checks

  Background:
    Given init-detect-git-network-actions: the driver and local Git fixture are ready

  Scenario: Refuse a fetch from a remote URL
    When init-detect-git-network-actions: Validate check "git fetch https://example.invalid/repo.git"
    Then init-detect-git-network-actions: validation problems equal:
      """
      ["check probe (git fetch https://example.invalid/repo.git) contacts a remote host; checks must not depend on the network"]
      """

  Scenario: Refuse a pull by remote name
    When init-detect-git-network-actions: Validate check "git pull origin main"
    Then init-detect-git-network-actions: validation problems equal:
      """
      ["check probe (git pull origin main) contacts a remote host; checks must not depend on the network"]
      """

  Scenario: Refuse a clone from a remote URL
    When init-detect-git-network-actions: Validate check "git clone https://example.invalid/repo.git copy"
    Then init-detect-git-network-actions: validation problems equal:
      """
      ["check probe (git clone https://example.invalid/repo.git copy) contacts a remote host; checks must not depend on the network"]
      """

  Scenario: Allow a fetch from a local path
    When init-detect-git-network-actions: Validate check "git fetch ./repo.git main"
    Then init-detect-git-network-actions: validation problems equal:
      """
      []
      """

  Scenario: Allow a clone from a local path
    When init-detect-git-network-actions: Validate check "git clone repo.git copy"
    Then init-detect-git-network-actions: validation problems equal:
      """
      []
      """

  Scenario: Allow a pull by bare local path
    When init-detect-git-network-actions: Validate check "git pull repo.git main"
    Then init-detect-git-network-actions: validation problems equal:
      """
      []
      """

  Scenario Outline: Refuse other literal remote Git sources
    When init-detect-git-network-actions: Validate check "<command>"
    Then init-detect-git-network-actions: validation problems equal:
      """
      ["check probe (<command>) contacts a remote host; checks must not depend on the network"]
      """

    Examples:
      | command                                                        |
      | git pull https://example.invalid/repo.git main                  |
      | git clone --depth 1 -- 'ssh://git@example.invalid/repo.git' copy |
      | git fetch git@example.invalid:team/repo.git                     |
      | git ls-remote https://example.invalid/repo.git                  |

  Scenario Outline: Preserve other local Git sources
    When init-detect-git-network-actions: Validate check "<command>"
    Then init-detect-git-network-actions: validation problems equal:
      """
      []
      """

    Examples:
      | command                                           |
      | git fetch file:///tmp/repo.git                    |
      | git fetch http://localhost:8080/repo.git          |
      | git pull ./origin main                            |
      | git clone ./repo.git 'example.invalid:local-copy' |

  Scenario: Publishing retains its own refusal
    When init-detect-git-network-actions: Validate check "git push https://example.invalid/repo.git"
    Then init-detect-git-network-actions: validation problems equal:
      """
      ["check probe (git push https://example.invalid/repo.git) publishes or deploys"]
      """
