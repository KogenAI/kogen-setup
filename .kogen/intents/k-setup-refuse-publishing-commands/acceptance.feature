Feature: Refuse publishing commands before init execution
  Scenario: Validate publishing, deploying, dry-run and unrelated commands
    When k-setup-refuse-publishing-commands: validate these commands:
      """
      [
        {"kind":"check","name":"a","run":"npm publish","reject":true},
        {"kind":"check","name":"b","run":"echo ok && git push origin main","reject":true},
        {"kind":"check","name":"c","run":"docker push img:1","reject":true},
        {"kind":"check","name":"d","run":"npm publish --dry-run","reject":false},
        {"kind":"check","name":"e","run":"npm test","reject":false},
        {"kind":"check","name":"f","run":"git diff --check","reject":false},
        {"kind":"setup","run":"terraform apply -auto-approve","reject":true},
        {"kind":"fix","run":"yarn publish","reject":true},
        {"kind":"check","name":"pnpm","run":"pnpm publish","reject":true},
        {"kind":"check","name":"cargo","run":"cargo publish","reject":true},
        {"kind":"setup","run":"gem push pkg.gem","reject":true},
        {"kind":"fix","run":"twine upload dist/*","reject":true},
        {"kind":"check","name":"mix","run":"mix hex.publish","reject":true},
        {"kind":"check","name":"kubectl","run":"kubectl apply -f app.yaml","reject":true},
        {"kind":"check","name":"helm-install","run":"helm install app chart","reject":true},
        {"kind":"fix","run":"helm upgrade app chart","reject":true},
        {"kind":"setup","run":"echo ok; npm publish","reject":true},
        {"kind":"fix","run":"false || npm publish","reject":true},
        {"kind":"check","name":"pipe","run":"cat x | npm publish","reject":true},
        {"kind":"check","name":"newline","run":"echo ok\nnpm publish","reject":true},
        {"kind":"check","name":"short-dry","run":"npm publish -n","reject":false},
        {"kind":"setup","run":"terraform apply --dry-run","reject":false},
        {"kind":"fix","run":"terraform apply -n","reject":true},
        {"kind":"check","name":"mixed","run":"npm publish --dry-run && git push","reject":true},
        {"kind":"check","name":"argument","run":"printf '%s' 'git push' && npm test","reject":false},
        {"kind":"check","name":"boundary","run":"git pusher","reject":false},
        {"kind":"check","name":"space","run":"  git   push origin main  ","reject":true}
      ]
      """
    Then k-setup-refuse-publishing-commands: every validation outcome matches

  Scenario: Correct the sole publishing check before any push reaches a remote
    When k-setup-refuse-publishing-commands: init proposes git push then drops it
    Then k-setup-refuse-publishing-commands: init reports "Checks: none found" without a remote push
