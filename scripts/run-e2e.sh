#!/usr/bin/env bash
set -euo pipefail

export DEBUG=pw:api
export SKILLTREE_E2E_IGNORE_SEGMENTS=0
export SKILLTREE_E2E_IGNORE_MANUAL_LEVELS=1
export SKILLTREE_E2E_TEMPLATE_CSV="tmp/graph example.csv"
export SKILLTREE_E2E_EXPORT_DIR="tmp/e2e-exports"

npx playwright test e2e/csv-import-export-roundtrip.spec.js --headed --project=chromium -g "creates the tree from CSV" --reporter=list --workers=1
