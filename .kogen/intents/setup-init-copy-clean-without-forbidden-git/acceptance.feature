Feature: Clean the init copy without forbidden Git commands
  This feature covers how init removes a check's leftovers in the init copy under the shipped coordinator guard.

  Scenario: The module pins the shipped coordinator guard
    Given setup-init-copy-clean-without-forbidden-git: the kogen-setup checkout
    Then setup-init-copy-clean-without-forbidden-git: go.mod pins kogen-coordinator at e643661cb646 or newer

  Scenario: Setup sends no forbidden command through the guarded runner
    Given setup-init-copy-clean-without-forbidden-git: the kogen-setup checkout
    Then setup-init-copy-clean-without-forbidden-git: no setup source sends a forbidden command to the guarded runner

  Scenario: The existing init cleanup tests pass against the shipped guard
    Given setup-init-copy-clean-without-forbidden-git: the kogen-setup checkout
    Then setup-init-copy-clean-without-forbidden-git: the module resolves the shipped coordinator and the existing init cleanup tests pass
