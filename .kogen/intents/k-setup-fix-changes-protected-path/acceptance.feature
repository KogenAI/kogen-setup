Feature: Fix commands must not change protected paths

  Scenario: Keep a fixer that changes only an unprotected file, in the copy only
    When k-setup-fix-changes-protected-path: Init verifies the proposed commands and protected paths on this committed fixture:
      """
      {"files":{"a.txt":"a\n","lint.cfg":"lint\n"},"checks":[{"name":"lint","run":"test -f lint.cfg"}],"protect":["lint.cfg"],"fix":["printf x > a.txt","test \"$(cat a.txt)\" = x"]}
      """
    Then k-setup-fix-changes-protected-path: the saved lists, summary lines, fix progress and real project files are:
      """
      {"exit":0,"error":"","fix":["printf x > a.txt","test \"$(cat a.txt)\" = x"],"protect":["lint.cfg"],"lines":["Fix: printf x > a.txt; test \"$(cat a.txt)\" = x","Checks: lint","Protect: lint.cfg"],"progress":["kogen: running fix-1: printf x > a.txt","kogen: running fix-1 again: printf x > a.txt","kogen: running fix-2: test \"$(cat a.txt)\" = x","kogen: running fix-2 again: test \"$(cat a.txt)\" = x"],"files":{"a.txt":"a\n","lint.cfg":"lint\n"},"status":""}
      """

  Scenario: Leave out a fixer that appends to the protected file and restore that file
    When k-setup-fix-changes-protected-path: Init verifies the proposed commands and protected paths on this committed fixture:
      """
      {"files":{"a.txt":"a\n","lint.cfg":"lint\n"},"checks":[{"name":"lint","run":"test -f lint.cfg"}],"protect":["lint.cfg"],"fix":["printf x >> lint.cfg","test \"$(cat lint.cfg)\" = lint"]}
      """
    Then k-setup-fix-changes-protected-path: the saved lists, summary lines, fix progress and real project files are:
      """
      {"exit":0,"error":"","fix":["test \"$(cat lint.cfg)\" = lint"],"protect":["lint.cfg"],"lines":["Fix: test \"$(cat lint.cfg)\" = lint","Checks: lint","Protect: lint.cfg","Left out: fix-1 (printf x >> lint.cfg) changed protected lint.cfg"],"progress":["kogen: running fix-1: printf x >> lint.cfg","kogen: running fix-2: test \"$(cat lint.cfg)\" = lint","kogen: running fix-2 again: test \"$(cat lint.cfg)\" = lint"],"files":{"a.txt":"a\n","lint.cfg":"lint\n"},"status":""}
      """

  Scenario: Leave out as a whole a fixer that appends to an unprotected and a protected file, restoring both
    When k-setup-fix-changes-protected-path: Init verifies the proposed commands and protected paths on this committed fixture:
      """
      {"files":{"a.txt":"a\n","lint.cfg":"lint\n"},"checks":[{"name":"lint","run":"test -f lint.cfg"}],"protect":["lint.cfg"],"fix":["sh -c 'printf x >> a.txt; printf x >> lint.cfg'","test \"$(cat a.txt)\" = a && test \"$(cat lint.cfg)\" = lint"]}
      """
    Then k-setup-fix-changes-protected-path: the saved lists, summary lines, fix progress and real project files are:
      """
      {"exit":0,"error":"","fix":["test \"$(cat a.txt)\" = a && test \"$(cat lint.cfg)\" = lint"],"protect":["lint.cfg"],"lines":["Fix: test \"$(cat a.txt)\" = a && test \"$(cat lint.cfg)\" = lint","Checks: lint","Protect: lint.cfg","Left out: fix-1 (sh -c 'printf x >> a.txt; printf x >> lint.cfg') changed protected lint.cfg"],"progress":["kogen: running fix-1: sh -c 'printf x >> a.txt; printf x >> lint.cfg'","kogen: running fix-2: test \"$(cat a.txt)\" = a && test \"$(cat lint.cfg)\" = lint","kogen: running fix-2 again: test \"$(cat a.txt)\" = a && test \"$(cat lint.cfg)\" = lint"],"files":{"a.txt":"a\n","lint.cfg":"lint\n"},"status":""}
      """

  Scenario: Leave out a repeatable fixer that rewrites the protected file and restore both files
    When k-setup-fix-changes-protected-path: Init verifies the proposed commands and protected paths on this committed fixture:
      """
      {"files":{"a.txt":"a\n","lint.cfg":"lint\n"},"checks":[{"name":"lint","run":"test -f lint.cfg"}],"protect":["lint.cfg"],"fix":["sh -c 'printf x > a.txt; printf x > lint.cfg'","test \"$(cat a.txt)\" = a && test \"$(cat lint.cfg)\" = lint"]}
      """
    Then k-setup-fix-changes-protected-path: the saved lists, summary lines, fix progress and real project files are:
      """
      {"exit":0,"error":"","fix":["test \"$(cat a.txt)\" = a && test \"$(cat lint.cfg)\" = lint"],"protect":["lint.cfg"],"lines":["Fix: test \"$(cat a.txt)\" = a && test \"$(cat lint.cfg)\" = lint","Checks: lint","Protect: lint.cfg","Left out: fix-1 (sh -c 'printf x > a.txt; printf x > lint.cfg') changed protected lint.cfg"],"progress":["kogen: running fix-1: sh -c 'printf x > a.txt; printf x > lint.cfg'","kogen: running fix-2: test \"$(cat a.txt)\" = a && test \"$(cat lint.cfg)\" = lint","kogen: running fix-2 again: test \"$(cat a.txt)\" = a && test \"$(cat lint.cfg)\" = lint"],"files":{"a.txt":"a\n","lint.cfg":"lint\n"},"status":""}
      """

  Scenario: Keep the same repeatable fixer when no path is protected
    When k-setup-fix-changes-protected-path: Init verifies the proposed commands and protected paths on this committed fixture:
      """
      {"files":{"a.txt":"a\n","lint.cfg":"lint\n"},"checks":[{"name":"lint","run":"test -f lint.cfg"}],"protect":[],"fix":["sh -c 'printf x > a.txt; printf x > lint.cfg'","test \"$(cat a.txt)\" = x && test \"$(cat lint.cfg)\" = x"]}
      """
    Then k-setup-fix-changes-protected-path: the saved lists, summary lines, fix progress and real project files are:
      """
      {"exit":0,"error":"","fix":["sh -c 'printf x > a.txt; printf x > lint.cfg'","test \"$(cat a.txt)\" = x && test \"$(cat lint.cfg)\" = x"],"protect":[],"lines":["Fix: sh -c 'printf x > a.txt; printf x > lint.cfg'; test \"$(cat a.txt)\" = x && test \"$(cat lint.cfg)\" = x","Checks: lint","Protect: none"],"progress":["kogen: running fix-1: sh -c 'printf x > a.txt; printf x > lint.cfg'","kogen: running fix-1 again: sh -c 'printf x > a.txt; printf x > lint.cfg'","kogen: running fix-2: test \"$(cat a.txt)\" = x && test \"$(cat lint.cfg)\" = x","kogen: running fix-2 again: test \"$(cat a.txt)\" = x && test \"$(cat lint.cfg)\" = x"],"files":{"a.txt":"a\n","lint.cfg":"lint\n"},"status":""}
      """

  Scenario: With no protected path the appending fixer is still judged only for repeatability
    When k-setup-fix-changes-protected-path: Init verifies the proposed commands and protected paths on this committed fixture:
      """
      {"files":{"a.txt":"a\n","lint.cfg":"lint\n"},"checks":[{"name":"lint","run":"test -f lint.cfg"}],"protect":[],"fix":["sh -c 'printf x >> a.txt; printf x >> lint.cfg'"]}
      """
    Then k-setup-fix-changes-protected-path: the saved lists, summary lines, fix progress and real project files are:
      """
      {"exit":0,"error":"","fix":[],"protect":[],"lines":["Fix: none","Checks: lint","Protect: none","Left out: fix-1 (sh -c 'printf x >> a.txt; printf x >> lint.cfg') is not repeatable: its second run changed a.txt, lint.cfg"],"progress":["kogen: running fix-1: sh -c 'printf x >> a.txt; printf x >> lint.cfg'","kogen: running fix-1 again: sh -c 'printf x >> a.txt; printf x >> lint.cfg'"],"files":{"a.txt":"a\n","lint.cfg":"lint\n"},"status":""}
      """

  Scenario: Name every changed protected path, sorted, and no unprotected path
    When k-setup-fix-changes-protected-path: Init verifies the proposed commands and protected paths on this committed fixture:
      """
      {"files":{"a.txt":"a\n","lint.cfg":"lint\n","tests.list":"t\n"},"checks":[{"name":"lint","run":"test -f lint.cfg"}],"protect":["lint.cfg","tests.list"],"fix":["sh -c 'printf x > tests.list; printf x > lint.cfg; printf x > a.txt'"]}
      """
    Then k-setup-fix-changes-protected-path: the saved lists, summary lines, fix progress and real project files are:
      """
      {"exit":0,"error":"","fix":[],"protect":["lint.cfg","tests.list"],"lines":["Fix: none","Checks: lint","Protect: lint.cfg; tests.list","Left out: fix-1 (sh -c 'printf x > tests.list; printf x > lint.cfg; printf x > a.txt') changed protected lint.cfg, tests.list"],"progress":["kogen: running fix-1: sh -c 'printf x > tests.list; printf x > lint.cfg; printf x > a.txt'"],"files":{"a.txt":"a\n","lint.cfg":"lint\n","tests.list":"t\n"},"status":""}
      """
