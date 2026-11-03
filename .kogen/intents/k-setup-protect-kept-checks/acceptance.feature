Feature: Protect only definitions still used by kept checks
  Scenario: Failing lint loses its manifest protection
    When init verifies lint exit 1 protecting "package.json" with embedded settings "no" and ok "yes"
    Then the kept-check configuration is:
      """
      {"checks":["ok"],"protect":[],"omitted":["lint (npm run lint) failed with status 1","package.json"]}
      """

  Scenario: Passing lint retains its manifest protection
    When init verifies lint exit 0 protecting "package.json" with embedded settings "no" and ok "yes"
    Then the kept-check configuration is:
      """
      {"checks":["lint","ok"],"protect":["package.json"],"omitted":[]}
      """

  Scenario: README is not dependent on lint eligibility
    When init verifies lint exit 1 protecting "README.md" with embedded settings "no" and ok "yes"
    Then the kept-check configuration is:
      """
      {"checks":["ok"],"protect":["README.md"],"omitted":["lint (npm run lint) failed with status 1"]}
      """

  Scenario: Embedded settings remain eligible
    When init verifies lint exit 1 protecting "package.json" with embedded settings "yes" and ok "yes"
    Then the kept-check configuration is:
      """
      {"checks":["ok"],"protect":["package.json"],"omitted":["lint (npm run lint) failed with status 1"]}
      """

  Scenario: No kept checks protects nothing
    When init verifies lint exit 1 protecting "README.md" with embedded settings "no" and ok "no"
    Then the kept-check configuration is:
      """
      {"checks":[],"protect":[],"omitted":["lint (npm run lint) failed with status 1"]}
      """
