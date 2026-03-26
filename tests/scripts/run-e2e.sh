#!/usr/bin/env bash
set -euo pipefail

DATASET="${1:-large}"
PHASES="${2:-statuses,scopes,segments,roundtrip}"
HEADED="${HEADED:-1}"

export SKILLTREE_TEST_ARTIFACTS_DIR="tests/results"
export SKILLTREE_E2E_EXPORT_DIR="tests/results/e2e-exports"
export SKILLTREE_E2E_METRICS_DIR="tests/results/e2e-metrics"
export SKILLTREE_E2E_DATASET="$DATASET"
export SKILLTREE_E2E_PHASES="$PHASES"
export SKILLTREE_E2E_IGNORE_SEGMENTS="${SKILLTREE_E2E_IGNORE_SEGMENTS:-0}"
export SKILLTREE_E2E_IGNORE_PROGRESS_LEVELS="${SKILLTREE_E2E_IGNORE_PROGRESS_LEVELS:-1}"
export DEBUG="${DEBUG:-pw:api}"

cmd=(
	npx playwright test tests/e2e/csv-import-export-roundtrip.spec.js
	--project=chromium
	-g "creates the tree from CSV"
	--workers=1
)

if [[ "$HEADED" == "1" ]]; then
	cmd+=(--headed)
fi

"${cmd[@]}"
