#!/usr/bin/env bash
set -euo pipefail
cd /home/marten/Development/roadmap-skilltree-builder

dataset="${1:-small}"

case "$dataset" in
	small|medium|large)
		export SKILLTREE_E2E_DATASET="$dataset"
		unset SKILLTREE_E2E_TEMPLATE_CSV
		;;
	mykyana)
		export SKILLTREE_E2E_DATASET=custom
		export SKILLTREE_E2E_TEMPLATE_CSV=/home/marten/Development/roadmap-skilltree-builder/tests/e2e/datasets/myKyana.csv
		;;
	*)
		echo "Usage: $0 {small|medium|large|mykyana}" >&2
		exit 1
		;;
esac

export SKILLTREE_E2E_IGNORE_SEGMENTS=1
export SKILLTREE_E2E_IGNORE_MANUAL_LEVELS=1
export SKILLTREE_E2E_HOLD_OPEN=1
npx playwright test tests/e2e/csv-import-export-roundtrip.spec.js -c playwright.config.js --headed --project=chromium --trace=on --workers=1 --reporter=list
