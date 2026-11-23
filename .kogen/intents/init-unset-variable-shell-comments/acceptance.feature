Feature: Ignore shell comments when checking commands for unset variables
  This feature covers Validate of a proposed setup, fix or check command. The init environment
  is exactly SET_ONE=1, so UNSET_ONE and UNSET_TWO are not set. A reported variable is
  one that the command expands and the environment does not provide.

  Scenario Outline: Text after an unquoted comment marker is not a reference
    When init-unset-variable-shell-comments: Validate this proposal with the init environment SET_ONE=1
      """
      {"role":"<role>","command":<command>}
      """
    Then init-unset-variable-shell-comments: the reported unset variables are exactly
      """
      []
      """

    Examples:
      | role  | command |
      | check | "mkdir ok # $UNSET_ONE" |
      | check | "mkdir ok #$UNSET_ONE ${UNSET_TWO}" |
      | check | "# $UNSET_ONE" |
      | check | "mkdir ok # UNSET_ONE=x; mkdir $UNSET_TWO" |
      | setup | "mkdir ok # $UNSET_ONE" |
      | fix   | "mkdir ok # $UNSET_ONE" |

  Scenario Outline: An unset variable expanded before the comment marker is still reported
    When init-unset-variable-shell-comments: Validate this proposal with the init environment SET_ONE=1
      """
      {"role":"<role>","command":<command>}
      """
    Then init-unset-variable-shell-comments: the reported unset variables are exactly
      """
      <names>
      """

    Examples:
      | role  | command | names |
      | check | "mkdir $UNSET_ONE # $UNSET_TWO" | ["UNSET_ONE"] |
      | check | "mkdir $UNSET_ONE; # comment" | ["UNSET_ONE"] |
      | check | "mkdir $UNSET_ONE # $SET_ONE" | ["UNSET_ONE"] |
      | setup | "mkdir $UNSET_ONE # note" | ["UNSET_ONE"] |
      | fix   | "mkdir $UNSET_ONE # note" | ["UNSET_ONE"] |

  Scenario Outline: A marker inside quotes or a word does not hide a later live reference
    When init-unset-variable-shell-comments: Validate this proposal with the init environment SET_ONE=1
      """
      {"role":"<role>","command":<command>}
      """
    Then init-unset-variable-shell-comments: the reported unset variables are exactly
      """
      <names>
      """

    Examples:
      | role  | command | names |
      | check | "mkdir \"a # b\" $UNSET_ONE" | ["UNSET_ONE"] |
      | check | "mkdir 'a # b' $UNSET_ONE" | ["UNSET_ONE"] |
      | check | "mkdir \"# $UNSET_ONE\"" | ["UNSET_ONE"] |
      | check | "mkdir a#b $UNSET_ONE" | ["UNSET_ONE"] |
      | check | "mkdir \\\\# $UNSET_ONE" | ["UNSET_ONE"] |
      | check | "mkdir $# ${#} $UNSET_ONE" | ["UNSET_ONE"] |
      | setup | "mkdir \"a # b\" $UNSET_ONE" | ["UNSET_ONE"] |
      | fix   | "mkdir 'a # b' $UNSET_ONE" | ["UNSET_ONE"] |
