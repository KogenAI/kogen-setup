Feature: Refuse literal failure masks
  # Commands use JSON Unicode escapes for pipe characters; steps decode them before Validate.
  Scenario Outline: Validate each proposal independently
    When k-setup-check-masks-failure: Validate check "<name>" with command '<command>' in "<role>"
    Then k-setup-check-masks-failure: the problems are "<result>"

    Examples:
      | name    | command                                       | role  | result |
      | masked  | false \u007c\u007c true                       | checks | mask |
      | masked2 | ls missing-dir; true                         | checks | mask |
      | masked3 | sleep 1 &                                    | checks | mask |
      | test    | make test \u007c\u007c true                   | checks | mask |
      | test    | npm test \u007c\u007c :                       | checks | mask |
      | test    | pytest; true                                 | checks | mask |
      | test    | go test ./... \u007c\u007c exit 0             | checks | mask |
      | test    | false; :                                     | checks | mask |
      | test    | false; exit 0                                | checks | mask |
      | honest  | test -f README.md \u007c\u007c (echo missing; exit 1) | checks | none |
      | quoted  | echo "a \u007c\u007c true"                    | checks | nothing |
      | test    | false \u007c\u007c echo failed && exit 1       | checks | none |
      | test    | false \u007c\u007c (cat log; exit 1)           | checks | none |
      | test    | if false; then true; fi                      | checks | none |
      | test    | case x in x) true;; esac                     | checks | none |
      | test    | test -f "a \u007c\u007c true"                 | checks | none |
      | test    | sleep 1 & wait                               | checks | none |
      | test    | false \u007c\u007c true                       | setup | none |
      | test    | false; true                                  | fix   | none |
