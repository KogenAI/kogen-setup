Feature: Bound every init verification command
  Scenario: Omit hanging commands and retain the passing check
    When init verifies timeout proposal '{"setup":["sleep 30"],"checks":[{"name":"slow","run":"echo before; sleep 30"},{"name":"good","run":"true"}],"fix":["sleep 30"]}'
    Then the timeout outcome is:
      """
      {"setup":[],"fix":[],"checks":["good"],"omitted":["setup-1","slow","fix-1"],"tail":true,"runs":1,"again":0}
      """

  Scenario: Retain commands that finish just inside the limit
    When init verifies timeout proposal '{"setup":["sleep 0.8"],"checks":[{"name":"near","run":"sleep 0.8"}],"fix":["sleep 0.8"]}'
    Then the timeout outcome is:
      """
      {"setup":["sleep 0.8"],"fix":["sleep 0.8"],"checks":["near"],"omitted":[],"tail":false,"runs":1,"again":1}
      """

  Scenario: Bound the second setup run
    When init verifies timeout proposal '{"setup":["if [ -f marker ]; then sleep 30; else touch marker; fi"],"checks":[{"name":"good","run":"true"}],"fix":[]}'
    Then the timeout outcome is:
      """
      {"setup":[],"fix":[],"checks":["good"],"omitted":["setup-1"],"tail":false,"runs":1,"again":1}
      """
