Feature: Init handles large path lists without changing small projects
  Background:
    Given k-init-large-file-list: the unchanged small project result
      """
      {"exit":0,"error":null,"success":"Initialized Kogen in ","requests":1,"commits":1,"subject":"Add Kogen configuration","files":[".gitignore",".kogen/models.yaml",".kogen/project.yaml","features/steps/README.md"],"configurationPath":".kogen/project.yaml","config":"version: 1\ncommands:\n  setup: []          # run before readiness dry runs and before each Build\n  fix: []            # deterministic fixers, run once after each builder round\n  checks:\n    - name: readme\n      run: 'test -f README.md'\n    - name: snapshot\n      run: 'python3 verify.py'\n  acceptance:\n    run: 'NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" \"$KOGEN_CUCUMBER/@cucumber/cucumber/bin/cucumber.js\" --strict --require ''features/steps/*.js'' --format \"message:$KOGEN_ACCEPTANCE_REPORT\" \"$KOGEN_ACCEPTANCE_FEATURES\"'\n    steps_dir: 'features/steps'\nprotect: []          # check configuration the Build must not change, e.g. .credo.exs\n","models":"models:\n  shape:\n    provider: chatgpt\n    model: gpt-6.1-sol\n    effort: high\n  build:\n    provider: chatgpt\n    model: gpt-6.1-sol\n    effort: medium\n  review:\n    provider: chatgpt\n    model: gpt-6.1-terra\n    effort: medium\n","ignore":".kogen/local/\n","bridge":"Cucumber step definitions for Kogen acceptance scenarios.\n"}
      """

  Scenario: Restore a very large dirty tracked tree
    Then k-init-large-file-list: init succeeds with 40000 changed tracked files, at least 2000001 path bytes and Git argv bounded to 32768 bytes

  Scenario: Preserve the small project result
    Then k-init-large-file-list: init succeeds with 2 changed tracked files, at least 0 path bytes and Git argv bounded to 32768 bytes
