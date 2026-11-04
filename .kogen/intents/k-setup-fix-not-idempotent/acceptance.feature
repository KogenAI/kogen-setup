Feature: Fix commands must be repeatable on the tree their first run left

  Scenario: Leave out a fixer whose second run changes a tracked file again
    When k-setup-fix-not-idempotent: Init verifies the proposed fix commands on this committed fixture:
      """
      {"files":{"f.txt":"a\n"},"fix":["printf x >> f.txt"]}
      """
    Then k-setup-fix-not-idempotent: the saved fix commands, summary lines and fix progress are:
      """
      {"exit":0,"error":"","fix":[],"lines":["Fix: none","Left out: fix-1 (printf x >> f.txt) is not repeatable: its second run changed f.txt"],"progress":["kogen: running fix-1: printf x >> f.txt","kogen: running fix-1 again: printf x >> f.txt"]}
      """

  Scenario: Keep a fixer whose first run changes a file and whose second run changes nothing
    When k-setup-fix-not-idempotent: Init verifies the proposed fix commands on this committed fixture:
      """
      {"files":{"list.txt":"b\na\n"},"fix":["sort -o list.txt list.txt"]}
      """
    Then k-setup-fix-not-idempotent: the saved fix commands, summary lines and fix progress are:
      """
      {"exit":0,"error":"","fix":["sort -o list.txt list.txt"],"lines":["Fix: sort -o list.txt list.txt"],"progress":["kogen: running fix-1: sort -o list.txt list.txt","kogen: running fix-1 again: sort -o list.txt list.txt"]}
      """

  Scenario: Keep a fixer that changes nothing
    When k-setup-fix-not-idempotent: Init verifies the proposed fix commands on this committed fixture:
      """
      {"files":{"f.txt":"a\n"},"fix":["test -f f.txt"]}
      """
    Then k-setup-fix-not-idempotent: the saved fix commands, summary lines and fix progress are:
      """
      {"exit":0,"error":"","fix":["test -f f.txt"],"lines":["Fix: test -f f.txt"],"progress":["kogen: running fix-1: test -f f.txt","kogen: running fix-1 again: test -f f.txt"]}
      """

  Scenario: Leave out a fixer whose second run fails and remove the file its first run made
    When k-setup-fix-not-idempotent: Init verifies the proposed fix commands on this committed fixture:
      """
      {"files":{"f.txt":"a\n"},"fix":["sh -c 'test -f once || { touch once; exit 0; }; exit 3'","test ! -e once"]}
      """
    Then k-setup-fix-not-idempotent: the saved fix commands, summary lines and fix progress are:
      """
      {"exit":0,"error":"","fix":["test ! -e once"],"lines":["Fix: test ! -e once","Left out: fix-1 (sh -c 'test -f once || { touch once; exit 0; }; exit 3') is not repeatable: its second run failed with status 3"],"progress":["kogen: running fix-1: sh -c 'test -f once || { touch once; exit 0; }; exit 3'","kogen: running fix-1 again: sh -c 'test -f once || { touch once; exit 0; }; exit 3'","kogen: running fix-2: test ! -e once","kogen: running fix-2 again: test ! -e once"]}
      """

  Scenario: A stable fixer after a non-repeatable one runs on the restored committed content
    When k-setup-fix-not-idempotent: Init verifies the proposed fix commands on this committed fixture:
      """
      {"files":{"f.txt":"a\n"},"fix":["printf x >> f.txt","test \"$(cat f.txt)\" = a"]}
      """
    Then k-setup-fix-not-idempotent: the saved fix commands, summary lines and fix progress are:
      """
      {"exit":0,"error":"","fix":["test \"$(cat f.txt)\" = a"],"lines":["Fix: test \"$(cat f.txt)\" = a","Left out: fix-1 (printf x >> f.txt) is not repeatable: its second run changed f.txt"],"progress":["kogen: running fix-1: printf x >> f.txt","kogen: running fix-1 again: printf x >> f.txt","kogen: running fix-2: test \"$(cat f.txt)\" = a","kogen: running fix-2 again: test \"$(cat f.txt)\" = a"]}
      """

  Scenario: Leave out a fixer whose second run changes an untracked file and remove that file
    When k-setup-fix-not-idempotent: Init verifies the proposed fix commands on this committed fixture:
      """
      {"files":{"f.txt":"a\n"},"fix":["printf x >> notes.txt","test ! -e notes.txt"]}
      """
    Then k-setup-fix-not-idempotent: the saved fix commands, summary lines and fix progress are:
      """
      {"exit":0,"error":"","fix":["test ! -e notes.txt"],"lines":["Fix: test ! -e notes.txt","Left out: fix-1 (printf x >> notes.txt) is not repeatable: its second run changed notes.txt"],"progress":["kogen: running fix-1: printf x >> notes.txt","kogen: running fix-1 again: printf x >> notes.txt","kogen: running fix-2: test ! -e notes.txt","kogen: running fix-2 again: test ! -e notes.txt"]}
      """

  Scenario: Leave out a fixer whose second run times out and remove its effect
    When k-setup-fix-not-idempotent: Init verifies the proposed fix commands on this committed fixture:
      """
      {"files":{"f.txt":"a\n"},"fix":["if test -e .ran; then sleep 30; else touch .ran; fi","test ! -e .ran"],"timeoutMs":2000}
      """
    Then k-setup-fix-not-idempotent: the saved fix commands, summary lines and fix progress are:
      """
      {"exit":0,"error":"","fix":["test ! -e .ran"],"lines":["Fix: test ! -e .ran","Left out: fix-1 (if test -e .ran; then sleep 30; else touch .ran; fi) is not repeatable: its second run timed out after 10m"],"progress":["kogen: running fix-1: if test -e .ran; then sleep 30; else touch .ran; fi","kogen: running fix-1 again: if test -e .ran; then sleep 30; else touch .ran; fi","kogen: running fix-2: test ! -e .ran","kogen: running fix-2 again: test ! -e .ran"]}
      """
