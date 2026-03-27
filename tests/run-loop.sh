#!/bin/bash
# Run Playwright tests in loop and collect results
RUNS=${1:-5}
PASS=0
FAIL=0
FLAKY=0
TIMES=()

echo "=== Running $RUNS test loops ==="
for i in $(seq 1 $RUNS); do
  echo ""
  echo "--- Run $i/$RUNS ---"
  START=$(date +%s)
  OUTPUT=$(npx playwright test --reporter=list 2>&1)
  END=$(date +%s)
  DURATION=$((END - START))
  TIMES+=($DURATION)

  PASSED=$(echo "$OUTPUT" | grep -oP '\d+ passed' | grep -oP '\d+')
  FAILED=$(echo "$OUTPUT" | grep -oP '\d+ failed' | grep -oP '\d+')
  FLAKYC=$(echo "$OUTPUT" | grep -oP '\d+ flaky' | grep -oP '\d+')

  echo "  Passed: ${PASSED:-0} | Failed: ${FAILED:-0} | Flaky: ${FLAKYC:-0} | Time: ${DURATION}s"

  if [ "${FAILED:-0}" = "0" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
  FLAKY=$((FLAKY + ${FLAKYC:-0}))
done

echo ""
echo "=== SUMMARY ==="
echo "Runs: $RUNS"
echo "Clean passes: $PASS/$RUNS"
echo "Failures: $FAIL/$RUNS"
echo "Total flaky tests: $FLAKY"

# Calculate average time
TOTAL=0
for t in "${TIMES[@]}"; do TOTAL=$((TOTAL + t)); done
AVG=$((TOTAL / RUNS))
echo "Avg time per run: ${AVG}s"
echo "Total time: ${TOTAL}s"
