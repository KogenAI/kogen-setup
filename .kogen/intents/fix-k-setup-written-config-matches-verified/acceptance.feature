Feature: A failed init write leaves no new directories behind

  Scenario: A write that fails partway removes the file it wrote and the .kogen directory it created
    When fix-k-setup-written-config-matches-verified: kogen-setup runs and its .gitignore write fails, with:
      """
      {"dirs":[],"observe":[".kogen",".kogen/project.yaml",".kogen/models.yaml","features"]}
      """
    Then fix-k-setup-written-config-matches-verified: the outcome is:
      """
      {"code":70,"exit":70,"error":"open {repo}/.gitignore: no such file or directory","configuration":null,"initialized":false,"requests":1,"paths":{".kogen":false,".kogen/project.yaml":false,".kogen/models.yaml":false,"features":false},"status":"","headUnchanged":true}
      """

  Scenario: A write that fails partway keeps a .kogen directory that existed before Init
    When fix-k-setup-written-config-matches-verified: kogen-setup runs and its .gitignore write fails, with:
      """
      {"dirs":[".kogen"],"observe":[".kogen",".kogen/project.yaml",".kogen/models.yaml","features"]}
      """
    Then fix-k-setup-written-config-matches-verified: the outcome is:
      """
      {"code":70,"exit":70,"error":"open {repo}/.gitignore: no such file or directory","configuration":null,"initialized":false,"requests":1,"paths":{".kogen":true,".kogen/project.yaml":false,".kogen/models.yaml":false,"features":false},"status":"","headUnchanged":true}
      """

  Scenario: Existing setup tests remain green
    Then fix-k-setup-written-config-matches-verified: the existing setup tests pass
