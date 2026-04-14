#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Run All Load Tests
# Usage: ./load-tests/run-all.sh [BASE_URL]
#
# Requires k6: brew install k6
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BASE_URL="${1:-http://localhost:5173}"
RESULTS_DIR="load-tests/results"
mkdir -p "$RESULTS_DIR"

echo "=============================="
echo " NutriCare Load Test Suite"
echo " Target: $BASE_URL"
echo "=============================="

# ─── Baseline (100 concurrent users, ~4 min) ─────────────────────────────────
echo ""
echo "→ Running baseline test (100 concurrent users)..."
k6 run \
  --env BASE_URL="$BASE_URL" \
  --summary-export="$RESULTS_DIR/baseline-summary.json" \
  load-tests/scenarios/baseline.js \
  && echo "  ✓ Baseline PASSED" \
  || echo "  ✗ Baseline FAILED"

# ─── Stress (spike to 300 users, ~3.5 min) ───────────────────────────────────
echo ""
echo "→ Running stress test (spike to 300 users)..."
k6 run \
  --env BASE_URL="$BASE_URL" \
  --summary-export="$RESULTS_DIR/stress-summary.json" \
  load-tests/scenarios/stress.js \
  && echo "  ✓ Stress PASSED" \
  || echo "  ✗ Stress FAILED"

echo ""
echo "=============================="
echo " Results saved to $RESULTS_DIR/"
echo "=============================="
echo ""
echo "To run the soak test (4 hours):"
echo "  k6 run --env BASE_URL=$BASE_URL load-tests/scenarios/soak.js"
echo ""
echo "To view results with Grafana/InfluxDB:"
echo "  k6 run --out influxdb=http://localhost:8086/k6 load-tests/scenarios/baseline.js"
