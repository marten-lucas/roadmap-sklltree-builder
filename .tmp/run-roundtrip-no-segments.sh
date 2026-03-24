#!/usr/bin/env bash
set -euo pipefail
cd /home/marten/Development/roadmap-skilltree-builder
export SKILLTREE_E2E_DATASET=small
export SKILLTREE_E2E_TEMPLATE_CSV=/home/marten/Development/roadmap-skilltree-builder/tests/e2e/datasets/myKyana.csv
export SKILLTREE_E2E_IGNORE_SEGMENTS=1
export SKILLTREE_E2E_IGNORE_MANUAL_LEVELS=1
npx playwright test tests/e2e/csv-import-export-roundtrip.spec.js -c playwright.config.js --headed --project=chromium --trace=on --workers=1 --reporter=list
