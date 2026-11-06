Feature: kogen init without a login names the sign-in routes

  Scenario: With no saved login, the refusal keeps its first line and adds the routes
    When k-setup-init-login-refusal-names-routes: kogen-setup runs in a committed repository whose home has "no login"
    Then k-setup-init-login-refusal-names-routes: kogen-setup exits 4 with no configuration, no provider request, no new commit and the JSON error:
      """
      provider/login: not signed in; run kogen provider login for a supported provider
      """
    And k-setup-init-login-refusal-names-routes: stderr has these consecutive lines:
      """
      provider/login: not signed in; run kogen provider login for a supported provider
        browser sign-in: kogen provider login chatgpt
        no browser, Anthropic API key on standard input: printf '%s' "$ANTHROPIC_API_KEY" | kogen provider login anthropic
        no browser, Claude Code token on standard input: printf '%s' "$CLAUDE_CODE_OAUTH_TOKEN" | kogen provider login claude-code
        kogen provider --help lists every route
        with anthropic or claude-code, init then needs the configuration-first files described in docs/getting-started.md ("Without ChatGPT")
      """
    And k-setup-init-login-refusal-names-routes: no output contains a fixture environment value or saved credential

  Scenario: With a saved ChatGPT login, init proceeds without the refusal
    When k-setup-init-login-refusal-names-routes: kogen-setup runs in a committed repository whose home has "a ChatGPT login"
    Then k-setup-init-login-refusal-names-routes: kogen-setup initializes the repository with exit 0 after 1 provider request
    And k-setup-init-login-refusal-names-routes: no output contains "not signed in"
    And k-setup-init-login-refusal-names-routes: no output contains "kogen provider login"
    And k-setup-init-login-refusal-names-routes: no output contains "kogen provider --help"
    And k-setup-init-login-refusal-names-routes: no output contains a fixture environment value or saved credential
