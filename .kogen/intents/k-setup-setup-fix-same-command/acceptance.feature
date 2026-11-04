Feature: Remove redundant fix commands without changing setup or checks

  Scenario: A fix duplicates setup
    When k-setup-setup-fix-same-command: Merge and Init receive:
      """
      {"Detected":{},"Proposed":{"Setup":["npm ci"],"Fix":["npm ci"],"Checks":[]}}
      """
    Then k-setup-setup-fix-same-command: the results are:
      """
      {"merged":{"setup":["npm ci"],"fix":[],"checks":[]},"saved":{"setup":["npm ci"],"fix":[],"checks":[]},"drops":["Dropped: fix: npm ci (already in setup)"]}
      """

  Scenario: Whitespace matches checks but flags and filters do not
    When k-setup-setup-fix-same-command: Merge and Init receive:
      """
      {"Detected":{},"Proposed":{"Setup":[],"Fix":["make  lint","make lint --fix","make lint FILTER=unit"],"Checks":[{"Name":"lint","Run":"make lint"}]}}
      """
    Then k-setup-setup-fix-same-command: the results are:
      """
      {"merged":{"setup":[],"fix":["make lint --fix","make lint FILTER=unit"],"checks":[{"Name":"lint","Run":"make lint"}]},"saved":{"setup":[],"fix":["make lint --fix","make lint FILTER=unit"],"checks":[{"Name":"lint","Run":"make lint"}]},"drops":["Dropped: fix: make  lint (already in checks)"]}
      """

  Scenario: Unrelated commands survive
    When k-setup-setup-fix-same-command: Merge and Init receive:
      """
      {"Detected":{},"Proposed":{"Setup":["npm ci"],"Fix":["npm run format"],"Checks":[]}}
      """
    Then k-setup-setup-fix-same-command: the results are:
      """
      {"merged":{"setup":["npm ci"],"fix":["npm run format"],"checks":[]},"saved":{"setup":["npm ci"],"fix":["npm run format"],"checks":[]},"drops":[]}
      """

  Scenario: Only fix is removed when all lists share a key
    When k-setup-setup-fix-same-command: Merge and Init receive:
      """
      {"Detected":{"Setup":["npm ci"],"Fix":["npm ci","make  lint"]},"Proposed":{"Setup":["npm ci","make lint"],"Fix":["npm ci","make  lint","npm run format"],"Checks":[{"Name":"lint","Run":"make lint"}]}}
      """
    Then k-setup-setup-fix-same-command: the results are:
      """
      {"merged":{"setup":["npm ci","make lint"],"fix":["npm run format"],"checks":[{"Name":"lint","Run":"make lint"}]},"saved":{"setup":["npm ci","make lint"],"fix":["npm run format"],"checks":[{"Name":"lint","Run":"make lint"}]},"drops":["Dropped: fix: npm ci (already in setup)","Dropped: fix: make  lint (already in setup)"]}
      """

  Scenario: Existing init regression tests remain green
    Then k-setup-setup-fix-same-command: existing init tests pass
