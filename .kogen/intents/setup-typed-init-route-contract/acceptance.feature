Feature: Setup's incomplete route contract asserts the typed failure, not the sentence

  This feature runs the focused Setup test TestInitCompatibleKeyDoesNotSupplyRoute against temporary copies of the working tree whose compatible-key refusal in setup/init_route.go is changed, and runs the built standalone kogen-setup on a saved OpenAI-compatible key.

  Scenario: A wrong structured class, reason or exit fails the focused route test
    Given setup-typed-init-route-contract: the compatible-key refusal in setup/init_route.go is provider/login with exit 4
    When setup-typed-init-route-contract: the focused route test runs on copies of Setup whose refusal has class "environment", reason "route" or exit 3
    Then setup-typed-init-route-contract: the focused route test fails on every copy

  Scenario: A rewording of the refusal sentence does not fail the focused route test
    Given setup-typed-init-route-contract: the compatible-key refusal in setup/init_route.go is provider/login with exit 4
    When setup-typed-init-route-contract: the focused route test runs on a copy of Setup whose refusal sentence is reworded
    Then setup-typed-init-route-contract: the focused route test passes on the reworded copy
    And setup-typed-init-route-contract: the standalone kogen-setup still reports exit 4 and the original sentence for a saved compatible key with no write and no provider request
