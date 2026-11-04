Feature: Validate caps the size of each proposed list
  setup.Validate refuses a setup list over 20 commands, a fix list over 10 commands, a checks list
  over 20 checks and a protect list over 50 paths, with one problem per list. The steps generate
  distinct, individually valid entries: setup "mkdir -p build/sNN", fix "gofmt -w pkgNN", check
  "check-NN" running "go vet ./pkgNN", protect "docs/pNN.md" (each listed as tracked) and detected
  check "detected-N" running "go test ./detectedN". A list of 0 entries is left out of the arguments.

  Scenario: 21 setup commands yield one problem naming setup, 21 and 20
    When k-setup-proposal-size-bounded: Validate 21 setup commands, 0 fix commands, 0 checks and 0 protect paths with 0 detected checks
    Then k-setup-proposal-size-bounded: the problems are exactly:
      """
      ["setup has 21 entries; at most 20 are allowed; keep the ones the project needs"]
      """
    And k-setup-proposal-size-bounded: no proposal is returned

  Scenario: 11 fix commands yield one problem for fix
    When k-setup-proposal-size-bounded: Validate 0 setup commands, 11 fix commands, 0 checks and 0 protect paths with 0 detected checks
    Then k-setup-proposal-size-bounded: the problems are exactly:
      """
      ["fix has 11 entries; at most 10 are allowed; keep the ones the project needs"]
      """
    And k-setup-proposal-size-bounded: no proposal is returned

  Scenario: 21 checks yield one problem for checks
    When k-setup-proposal-size-bounded: Validate 0 setup commands, 0 fix commands, 21 checks and 0 protect paths with 0 detected checks
    Then k-setup-proposal-size-bounded: the problems are exactly:
      """
      ["checks has 21 entries; at most 20 are allowed; keep the ones the project needs"]
      """
    And k-setup-proposal-size-bounded: no proposal is returned

  Scenario: 51 tracked protect paths yield one problem for protect
    When k-setup-proposal-size-bounded: Validate 0 setup commands, 0 fix commands, 0 checks and 51 protect paths with 0 detected checks
    Then k-setup-proposal-size-bounded: the problems are exactly:
      """
      ["protect has 51 entries; at most 50 are allowed; keep the ones the project needs"]
      """
    And k-setup-proposal-size-bounded: no proposal is returned

  Scenario: Every list at its cap yields no problem
    When k-setup-proposal-size-bounded: Validate 20 setup commands, 10 fix commands, 20 checks and 50 protect paths with 0 detected checks
    Then k-setup-proposal-size-bounded: the problems are exactly:
      """
      []
      """
    And k-setup-proposal-size-bounded: the proposal holds every submitted entry

  Scenario: Two lists over their caps yield two problems and no proposal
    When k-setup-proposal-size-bounded: Validate 20 setup commands, 11 fix commands, 20 checks and 51 protect paths with 0 detected checks
    Then k-setup-proposal-size-bounded: the problems, in any order, are:
      """
      ["fix has 11 entries; at most 10 are allowed; keep the ones the project needs", "protect has 51 entries; at most 50 are allowed; keep the ones the project needs"]
      """
    And k-setup-proposal-size-bounded: no proposal is returned

  Scenario: Detected checks do not add to the checks count
    When k-setup-proposal-size-bounded: Validate 0 setup commands, 0 fix commands, 21 checks and 0 protect paths with 3 detected checks
    Then k-setup-proposal-size-bounded: the problems are exactly:
      """
      ["checks has 21 entries; at most 20 are allowed; keep the ones the project needs"]
      """
    And k-setup-proposal-size-bounded: no proposal is returned

  Scenario: Detected checks are not counted and Merge returns all of them
    When k-setup-proposal-size-bounded: Validate 0 setup commands, 0 fix commands, 20 checks and 0 protect paths with 3 detected checks
    Then k-setup-proposal-size-bounded: the problems are exactly:
      """
      []
      """
    And k-setup-proposal-size-bounded: the proposal holds every submitted entry
    And k-setup-proposal-size-bounded: Merge with the detected checks returns the checks named:
      """
      ["detected-1", "detected-2", "detected-3", "check-01", "check-02", "check-03", "check-04", "check-05", "check-06", "check-07", "check-08", "check-09", "check-10", "check-11", "check-12", "check-13", "check-14", "check-15", "check-16", "check-17", "check-18", "check-19", "check-20"]
      """

  Scenario: Existing init tests stay green
    Then k-setup-proposal-size-bounded: the existing setup package tests pass
