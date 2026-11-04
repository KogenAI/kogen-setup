Feature: Fix commands must not break kept checks

  Scenario: Leave out a fixer after which a kept check fails, keeping the check
    When k-setup-fix-breaks-kept-checks: Init verifies the proposed checks and fix commands on this committed fixture:
      """
      {"files":{"state.txt":"ok\n"},"checks":[{"name":"t","run":"test \"$(cat state.txt)\" = ok"}],"fix":["printf bad > state.txt"]}
      """
    Then k-setup-fix-breaks-kept-checks: the saved lists, summary lines, verification progress and real project files are:
      """
      {"exit":0,"error":"","fix":[],"checks":[{"name":"t","run":"test \"$(cat state.txt)\" = ok"}],"lines":["Fix: none","Checks: t","Left out: fix-1 (printf bad > state.txt) breaks check t (test \"$(cat state.txt)\" = ok): failed with status 1"],"progress":["kogen: checking the acceptance runner","kogen: checking t: test \"$(cat state.txt)\" = ok","kogen: running t again: test \"$(cat state.txt)\" = ok","kogen: running fix-1: printf bad > state.txt","kogen: running fix-1 again: printf bad > state.txt","kogen: checking t after fix-1: test \"$(cat state.txt)\" = ok"],"files":{"state.txt":"ok\n"},"status":""}
      """

  Scenario: Keep a fixer after which every kept check still passes
    When k-setup-fix-breaks-kept-checks: Init verifies the proposed checks and fix commands on this committed fixture:
      """
      {"files":{"state.txt":"ok\n"},"checks":[{"name":"t","run":"test \"$(cat state.txt)\" = ok"}],"fix":["printf ok > other.txt"]}
      """
    Then k-setup-fix-breaks-kept-checks: the saved lists, summary lines, verification progress and real project files are:
      """
      {"exit":0,"error":"","fix":["printf ok > other.txt"],"checks":[{"name":"t","run":"test \"$(cat state.txt)\" = ok"}],"lines":["Fix: printf ok > other.txt","Checks: t"],"progress":["kogen: checking the acceptance runner","kogen: checking t: test \"$(cat state.txt)\" = ok","kogen: running t again: test \"$(cat state.txt)\" = ok","kogen: running fix-1: printf ok > other.txt","kogen: running fix-1 again: printf ok > other.txt","kogen: checking t after fix-1: test \"$(cat state.txt)\" = ok"],"files":{"state.txt":"ok\n"},"status":""}
      """

  Scenario: A breaking fixer is undone before the next fixer, which is kept
    When k-setup-fix-breaks-kept-checks: Init verifies the proposed checks and fix commands on this committed fixture:
      """
      {"files":{"state.txt":"ok\n"},"checks":[{"name":"t","run":"test \"$(cat state.txt)\" = ok"}],"fix":["printf bad > state.txt","printf ok > other.txt"]}
      """
    Then k-setup-fix-breaks-kept-checks: the saved lists, summary lines, verification progress and real project files are:
      """
      {"exit":0,"error":"","fix":["printf ok > other.txt"],"checks":[{"name":"t","run":"test \"$(cat state.txt)\" = ok"}],"lines":["Fix: printf ok > other.txt","Checks: t","Left out: fix-1 (printf bad > state.txt) breaks check t (test \"$(cat state.txt)\" = ok): failed with status 1"],"progress":["kogen: checking the acceptance runner","kogen: checking t: test \"$(cat state.txt)\" = ok","kogen: running t again: test \"$(cat state.txt)\" = ok","kogen: running fix-1: printf bad > state.txt","kogen: running fix-1 again: printf bad > state.txt","kogen: checking t after fix-1: test \"$(cat state.txt)\" = ok","kogen: running fix-2: printf ok > other.txt","kogen: running fix-2 again: printf ok > other.txt","kogen: checking t after fix-2: test \"$(cat state.txt)\" = ok"],"files":{"state.txt":"ok\n"},"status":""}
      """

  Scenario: With no fixers each check runs twice, as today
    When k-setup-fix-breaks-kept-checks: Init verifies the proposed checks and fix commands on this committed fixture:
      """
      {"files":{"state.txt":"ok\n"},"checks":[{"name":"t","run":"test \"$(cat state.txt)\" = ok"}],"fix":[]}
      """
    Then k-setup-fix-breaks-kept-checks: the saved lists, summary lines, verification progress and real project files are:
      """
      {"exit":0,"error":"","fix":[],"checks":[{"name":"t","run":"test \"$(cat state.txt)\" = ok"}],"lines":["Fix: none","Checks: t"],"progress":["kogen: checking the acceptance runner","kogen: checking t: test \"$(cat state.txt)\" = ok","kogen: running t again: test \"$(cat state.txt)\" = ok"],"files":{"state.txt":"ok\n"},"status":""}
      """

  Scenario: Rerun only the kept checks, in order, and name the one that fails
    When k-setup-fix-breaks-kept-checks: Init verifies the proposed checks and fix commands on this committed fixture:
      """
      {"files":{"state.txt":"ok\n"},"checks":[{"name":"present","run":"test -f state.txt"},{"name":"gone","run":"test -f missing.txt"},{"name":"t","run":"test \"$(cat state.txt)\" = ok"}],"fix":["printf bad > state.txt"]}
      """
    Then k-setup-fix-breaks-kept-checks: the saved lists, summary lines, verification progress and real project files are:
      """
      {"exit":0,"error":"","fix":[],"checks":[{"name":"present","run":"test -f state.txt"},{"name":"t","run":"test \"$(cat state.txt)\" = ok"}],"lines":["Fix: none","Checks: present, t","Left out: gone (test -f missing.txt) failed with status 1; fix-1 (printf bad > state.txt) breaks check t (test \"$(cat state.txt)\" = ok): failed with status 1"],"progress":["kogen: checking the acceptance runner","kogen: checking present: test -f state.txt","kogen: running present again: test -f state.txt","kogen: checking gone: test -f missing.txt","kogen: checking t: test \"$(cat state.txt)\" = ok","kogen: running t again: test \"$(cat state.txt)\" = ok","kogen: running fix-1: printf bad > state.txt","kogen: running fix-1 again: printf bad > state.txt","kogen: checking present after fix-1: test -f state.txt","kogen: checking t after fix-1: test \"$(cat state.txt)\" = ok"],"files":{"state.txt":"ok\n"},"status":""}
      """

  Scenario: Stop rerunning at the first kept check that fails
    When k-setup-fix-breaks-kept-checks: Init verifies the proposed checks and fix commands on this committed fixture:
      """
      {"files":{"state.txt":"ok\n"},"checks":[{"name":"t","run":"test \"$(cat state.txt)\" = ok"},{"name":"present","run":"test -f state.txt"}],"fix":["printf bad > state.txt"]}
      """
    Then k-setup-fix-breaks-kept-checks: the saved lists, summary lines, verification progress and real project files are:
      """
      {"exit":0,"error":"","fix":[],"checks":[{"name":"t","run":"test \"$(cat state.txt)\" = ok"},{"name":"present","run":"test -f state.txt"}],"lines":["Fix: none","Checks: t, present","Left out: fix-1 (printf bad > state.txt) breaks check t (test \"$(cat state.txt)\" = ok): failed with status 1"],"progress":["kogen: checking the acceptance runner","kogen: checking t: test \"$(cat state.txt)\" = ok","kogen: running t again: test \"$(cat state.txt)\" = ok","kogen: checking present: test -f state.txt","kogen: running present again: test -f state.txt","kogen: running fix-1: printf bad > state.txt","kogen: running fix-1 again: printf bad > state.txt","kogen: checking t after fix-1: test \"$(cat state.txt)\" = ok"],"files":{"state.txt":"ok\n"},"status":""}
      """

  Scenario: Leave out a fixer after which a kept check times out
    When k-setup-fix-breaks-kept-checks: Init verifies the proposed checks and fix commands on this committed fixture:
      """
      {"files":{"state.txt":"ok\n"},"checks":[{"name":"slow","run":"if test -e .slow; then sleep 30; fi"}],"fix":["touch .slow"],"timeoutMs":2000}
      """
    Then k-setup-fix-breaks-kept-checks: the saved lists, summary lines, verification progress and real project files are:
      """
      {"exit":0,"error":"","fix":[],"checks":[{"name":"slow","run":"if test -e .slow; then sleep 30; fi"}],"lines":["Fix: none","Checks: slow","Left out: fix-1 (touch .slow) breaks check slow (if test -e .slow; then sleep 30; fi): timed out after 10m"],"progress":["kogen: checking the acceptance runner","kogen: checking slow: if test -e .slow; then sleep 30; fi","kogen: running slow again: if test -e .slow; then sleep 30; fi","kogen: running fix-1: touch .slow","kogen: running fix-1 again: touch .slow","kogen: checking slow after fix-1: if test -e .slow; then sleep 30; fi"],"files":{"state.txt":"ok\n"},"status":""}
      """

  Scenario: With no kept check nothing is rerun after a fixer
    When k-setup-fix-breaks-kept-checks: Init verifies the proposed checks and fix commands on this committed fixture:
      """
      {"files":{"state.txt":"ok\n"},"checks":[{"name":"gone","run":"test -f missing.txt"}],"fix":["printf ok > other.txt"]}
      """
    Then k-setup-fix-breaks-kept-checks: the saved lists, summary lines, verification progress and real project files are:
      """
      {"exit":0,"error":"","fix":["printf ok > other.txt"],"checks":[],"lines":["Fix: printf ok > other.txt","Checks: none passed","Left out: gone (test -f missing.txt) failed with status 1"],"progress":["kogen: checking the acceptance runner","kogen: checking gone: test -f missing.txt","kogen: running fix-1: printf ok > other.txt","kogen: running fix-1 again: printf ok > other.txt"],"files":{"state.txt":"ok\n"},"status":""}
      """

  Scenario: A rerun leaves the copy as it found it for the next fixer
    When k-setup-fix-breaks-kept-checks: Init verifies the proposed checks and fix commands on this committed fixture:
      """
      {"files":{"state.txt":"ok\n"},"checks":[{"name":"build","run":"touch build.out"}],"fix":["printf ok > other.txt","test ! -e build.out"]}
      """
    Then k-setup-fix-breaks-kept-checks: the saved lists, summary lines, verification progress and real project files are:
      """
      {"exit":0,"error":"","fix":["printf ok > other.txt","test ! -e build.out"],"checks":[{"name":"build","run":"touch build.out"}],"lines":["Fix: printf ok > other.txt; test ! -e build.out","Checks: build"],"progress":["kogen: checking the acceptance runner","kogen: checking build: touch build.out","kogen: running build again: touch build.out","kogen: running fix-1: printf ok > other.txt","kogen: running fix-1 again: printf ok > other.txt","kogen: checking build after fix-1: touch build.out","kogen: running fix-2: test ! -e build.out","kogen: running fix-2 again: test ! -e build.out","kogen: checking build after fix-2: touch build.out"],"files":{"state.txt":"ok\n"},"status":""}
      """
