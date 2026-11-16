Feature: Left-out path lists of init state how many paths they omit
  This feature runs the compiled standalone init command on a fixture repository with a local scripted proposal and reads its summary. Each case commits the listed files with the given content, serves the given proposal and requires the exact summary line.

  Scenario: A check that changes seven tracked files states the count
    Then setup-init-left-out-path-lists-state-the-count: init states the left-out entry
      """
      {"files":["f1.txt","f2.txt","f3.txt","f4.txt","f5.txt","f6.txt","f7.txt"],"content":"a","proposal":{"setup":[],"fix":[],"checks":[{"name":"mutate","run":"echo x > f1.txt && echo x > f2.txt && echo x > f3.txt && echo x > f4.txt && echo x > f5.txt && echo x > f6.txt && echo x > f7.txt"}],"protect":[]},"want":"Left out: mutate (echo x > f1.txt && echo x > f2.txt && echo x > f3.txt && echo x > f4.txt && echo x > f5.txt && echo x > f6.txt && echo x > f7.txt) changed f1.txt, f2.txt, f3.txt, f4.txt, f5.txt and 2 more","notWant":["f5.txt, ...","f5.txt, f6.txt"]}
      """

  Scenario: A setup command whose second run changes seven files states the count
    Then setup-init-left-out-path-lists-state-the-count: init states the left-out entry
      """
      {"files":["f1.txt","f2.txt","f3.txt","f4.txt","f5.txt","f6.txt","f7.txt"],"content":"a","proposal":{"setup":["printf x >> f1.txt && printf x >> f2.txt && printf x >> f3.txt && printf x >> f4.txt && printf x >> f5.txt && printf x >> f6.txt && printf x >> f7.txt"],"fix":[],"checks":[],"protect":[]},"want":"Left out: setup-1 (printf x >> f1.txt && printf x >> f2.txt && printf x >> f3.txt && printf x >> f4.txt && printf x >> f5.txt && printf x >> f6.txt && printf x >> f7.txt) is not repeatable: its second run changed f1.txt, f2.txt, f3.txt, f4.txt, f5.txt and 2 more","notWant":["f5.txt, f6.txt"]}
      """

  Scenario: A fixer whose second run changes seven files states the count
    Then setup-init-left-out-path-lists-state-the-count: init states the left-out entry
      """
      {"files":["f1.txt","f2.txt","f3.txt","f4.txt","f5.txt","f6.txt","f7.txt"],"content":"a","proposal":{"setup":[],"fix":["printf x >> f1.txt && printf x >> f2.txt && printf x >> f3.txt && printf x >> f4.txt && printf x >> f5.txt && printf x >> f6.txt && printf x >> f7.txt"],"checks":[],"protect":[]},"want":"Left out: fix-1 (printf x >> f1.txt && printf x >> f2.txt && printf x >> f3.txt && printf x >> f4.txt && printf x >> f5.txt && printf x >> f6.txt && printf x >> f7.txt) is not repeatable: its second run changed f1.txt, f2.txt, f3.txt, f4.txt, f5.txt and 2 more","notWant":["f5.txt, f6.txt"]}
      """

  Scenario: A fixer that changes seven protected files states the count
    Then setup-init-left-out-path-lists-state-the-count: init states the left-out entry
      """
      {"files":["p1.cfg","p2.cfg","p3.cfg","p4.cfg","p5.cfg","p6.cfg","p7.cfg"],"content":"a","proposal":{"setup":[],"fix":["printf x > p1.cfg && printf x > p2.cfg && printf x > p3.cfg && printf x > p4.cfg && printf x > p5.cfg && printf x > p6.cfg && printf x > p7.cfg"],"checks":[],"protect":["p1.cfg","p2.cfg","p3.cfg","p4.cfg","p5.cfg","p6.cfg","p7.cfg"]},"want":"Left out: fix-1 (printf x > p1.cfg && printf x > p2.cfg && printf x > p3.cfg && printf x > p4.cfg && printf x > p5.cfg && printf x > p6.cfg && printf x > p7.cfg) changed protected p1.cfg, p2.cfg, p3.cfg, p4.cfg, p5.cfg and 2 more","notWant":["p5.cfg, p6.cfg"]}
      """

  Scenario: One path over the bound is counted as one more
    Then setup-init-left-out-path-lists-state-the-count: init states the left-out entry
      """
      {"files":["f1.txt","f2.txt","f3.txt","f4.txt","f5.txt","f6.txt"],"content":"a","proposal":{"setup":[],"fix":[],"checks":[{"name":"mutate","run":"echo x > f1.txt && echo x > f2.txt && echo x > f3.txt && echo x > f4.txt && echo x > f5.txt && echo x > f6.txt"}],"protect":[]},"want":"Left out: mutate (echo x > f1.txt && echo x > f2.txt && echo x > f3.txt && echo x > f4.txt && echo x > f5.txt && echo x > f6.txt) changed f1.txt, f2.txt, f3.txt, f4.txt, f5.txt and 1 more","notWant":["and 1 more paths","and 6 more","f5.txt, f6.txt"]}
      """

  Scenario: Five paths are listed in full without a count
    Then setup-init-left-out-path-lists-state-the-count: init states the left-out entry
      """
      {"files":["f1.txt","f2.txt","f3.txt","f4.txt","f5.txt"],"content":"a","proposal":{"setup":[],"fix":[],"checks":[{"name":"mutate","run":"echo x > f1.txt && echo x > f2.txt && echo x > f3.txt && echo x > f4.txt && echo x > f5.txt"}],"protect":[]},"want":"Left out: mutate (echo x > f1.txt && echo x > f2.txt && echo x > f3.txt && echo x > f4.txt && echo x > f5.txt) changed f1.txt, f2.txt, f3.txt, f4.txt, f5.txt","notWant":[" more","..."]}
      """

  Scenario: A short list prints as before
    Then setup-init-left-out-path-lists-state-the-count: init states the left-out entry
      """
      {"files":["f.txt"],"content":"a\n","proposal":{"setup":[],"fix":["printf x >> f.txt"],"checks":[],"protect":[]},"want":"Left out: fix-1 (printf x >> f.txt) is not repeatable: its second run changed f.txt"}
      """
