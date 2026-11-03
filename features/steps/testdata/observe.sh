#!/bin/sh
# Observer control for k-setup-fix-command-unverified: runs one control feature with the
# acceptance step definitions and prints only Cucumber's scenario and step counts. The exit
# status is Cucumber's.
out=$(NODE_PATH="$KOGEN_CUCUMBER" "$KOGEN_NODE" "$KOGEN_CUCUMBER/@cucumber/cucumber/bin/cucumber.js" --strict --require 'features/steps/*.js' --format summary "$1" 2>&1)
status=$?
printf '%s\n' "$out" | grep -E '^[0-9]+ (scenarios?|steps?) '
exit $status
