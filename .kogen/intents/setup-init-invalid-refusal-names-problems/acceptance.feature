Feature: The init refusal names the reasons of the last rejected answer

  This feature covers the refusal provider/init_invalid that kogen init ends with when the shaping model twice fails to return a valid configuration. The refusal keeps its detail text and carries the reasons of the last answer as detail lines.

  Scenario: The reason of a rejected last answer is shown
    When setup-init-invalid-refusal-names-problems: init is refused after the scripted answers "the same invalid answer twice"
    Then setup-init-invalid-refusal-names-problems: the refusal lines are exactly
      | setup must be a list |

  Scenario: Only the last answer's reasons are shown
    When setup-init-invalid-refusal-names-problems: init is refused after the scripted answers "an invalid answer, then an invalid answer with a different reason"
    Then setup-init-invalid-refusal-names-problems: the refusal lines are exactly
      | fix must be a list |

  Scenario: An answer without the call says so
    When setup-init-invalid-refusal-names-problems: init is refused after the scripted answers "an invalid answer, then an answer without the call"
    Then setup-init-invalid-refusal-names-problems: the refusal lines are exactly
      | the last answer did not call submit_configuration |

  Scenario: Seven problems are cut to five and a count
    When setup-init-invalid-refusal-names-problems: the refusal is built from 7 problems
    Then setup-init-invalid-refusal-names-problems: the refusal lines are exactly
      | problem 1          |
      | problem 2          |
      | problem 3          |
      | problem 4          |
      | problem 5          |
      | and 2 more problems |

  Scenario: Six problems end with a count of one
    When setup-init-invalid-refusal-names-problems: the refusal is built from 6 problems
    Then setup-init-invalid-refusal-names-problems: the refusal lines are exactly
      | problem 1         |
      | problem 2         |
      | problem 3         |
      | problem 4         |
      | problem 5         |
      | and 1 more problem |
