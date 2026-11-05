Feature: Restore the print-only check cases of TestInitValidateRunsNothing

  Scenario: Treating a print joined by && exit 0 as running nothing fails the setup tests
    When fix-k-setup-check-installs-dependencies: the setup tests run on the project and on its print-only check mutations
    Then fix-k-setup-check-installs-dependencies: the setup tests pass on the project
    And fix-k-setup-check-installs-dependencies: mutation "print-with-and" fails the setup tests for the check "echo ok && exit 0"

  Scenario: Reporting the printf/true check as running nothing instead of ignoring its failure fails the setup tests
    When fix-k-setup-check-installs-dependencies: the setup tests run on the project and on its print-only check mutations
    Then fix-k-setup-check-installs-dependencies: the setup tests pass on the project
    And fix-k-setup-check-installs-dependencies: mutation "print-with-exit" fails the setup tests for the check "printf '%s' ok; true || : | echo done; exit 0"
