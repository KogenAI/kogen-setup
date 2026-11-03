Feature: Reject commands naming the absolute project directory
  Scenario: Validate root references and adjacent accepted commands
    When k-setup-command-names-project-root: validate commands:
      """
      [
        {"kind":"check","name":"a","run":"cd /work/app && make test","reject":true},
        {"kind":"check","name":"b","run":"ls /work/app/src","reject":true},
        {"kind":"check","name":"c","run":"make test","reject":false},
        {"kind":"check","name":"d","run":"ls /work/app-other","reject":false},
        {"kind":"check","name":"e","run":"cd \"$PWD\" && make test","reject":false},
        {"kind":"setup","run":"cd /work/app && make test","reject":true},
        {"kind":"fix","run":"rm -rf /work/app/build","reject":true},
        {"kind":"check","name":"end","run":"ls /work/app","reject":true},
        {"kind":"check","name":"single","run":"ls '/work/app'","reject":true},
        {"kind":"check","name":"double","run":"ls \"/work/app\"","reject":true},
        {"kind":"check","name":"tab","run":"ls /work/app\t","reject":true},
        {"kind":"check","name":"newline","run":"ls /work/app\n","reject":true},
        {"kind":"setup","run":"make test","reject":false},
        {"kind":"fix","run":"ls /work/app-other","reject":false}
      ]
      """
    Then k-setup-command-names-project-root: validation matches every row

  Scenario: Init corrects away the only proposed root command
    When k-setup-command-names-project-root: init proposes a root command then drops it
    Then k-setup-command-names-project-root: init reports "Checks: none found"
