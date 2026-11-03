Feature: Reject proposed checks that run nothing
  Scenario: Validate the narrow syntactic rule
    When runs-nothing validation captures these cases:
      """
      [{"name":"a","run":"true","reject":true},{"name":"b","run":"echo ok && exit 0","reject":true},{"name":"c","run":":","reject":true},{"name":"d","run":"test -f README.md","reject":false},{"name":"e","run":"echo hi > out.txt","reject":false},{"name":"f","run":"go vet ./... && echo done","reject":false},{"name":"g","run":"echo \"tests passed\"","reject":true},{"name":"h","run":"printf '%s' ok; true || : | echo done\nexit 0","reject":true},{"name":"i","run":"echo $(pwd)","reject":false},{"name":"j","run":"echo `pwd`","reject":false},{"name":"k","run":"echo 'a;b|c'","reject":true}]
      """
    Then the runs-nothing validation matches every case

  Scenario: Drop the sole proposed check in one correction
    When runs-nothing init proposes check "a" with command "true" then drops it
    Then runs-nothing init reports "Checks: none found" with no checks and exactly 2 requests
