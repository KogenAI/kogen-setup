Feature: The Cucumber bridge keeps an existing steps README
  This feature checks init on a clean temporary git repository with one commit and no Cucumber runner.

  Scenario: A tracked steps README is kept
    When k-setup-bridge-keeps-existing-steps-readme: Init runs on a clean repository with no Cucumber runner tracking:
      """
      {"files":{"features/steps/README.md":"mine\n"},"read":["features/steps/README.md"]}
      """
    Then k-setup-bridge-keeps-existing-steps-readme: the results are:
      """
      {"exit":0,"acceptanceContains":["not configured","features/steps/README.md","already exists"],"files":{"features/steps/README.md":"mine\n"},"commitIncludes":[".kogen/project.yaml"],"commitExcludes":["features/steps/README.md"]}
      """

  Scenario: A tracked file named features leaves the bridge out
    When k-setup-bridge-keeps-existing-steps-readme: Init runs on a clean repository with no Cucumber runner tracking:
      """
      {"files":{"features":"not a directory\n"},"read":["features"]}
      """
    Then k-setup-bridge-keeps-existing-steps-readme: the results are:
      """
      {"exit":0,"acceptanceContains":["not configured","features"],"files":{"features":"not a directory\n"},"commitIncludes":[".kogen/project.yaml",".kogen/models.yaml"],"commitExcludes":["features"]}
      """

  Scenario: A repository with neither still gets the bridge
    When k-setup-bridge-keeps-existing-steps-readme: Init runs on a clean repository with no Cucumber runner tracking:
      """
      {"files":{"notes.txt":"one\n"},"read":["features/steps/README.md"]}
      """
    Then k-setup-bridge-keeps-existing-steps-readme: the results are:
      """
      {"exit":0,"acceptanceIs":"Acceptance: Cucumber bridge added in features/steps","files":{"features/steps/README.md":"Cucumber step definitions for Kogen acceptance scenarios.\n"},"commitIncludes":[".kogen/project.yaml","features/steps/README.md"]}
      """

  Scenario: Existing init tests stay green
    Then k-setup-bridge-keeps-existing-steps-readme: the existing setup tests pass
