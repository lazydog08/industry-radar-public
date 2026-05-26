#!/usr/bin/env bash
set -euo pipefail

START_DATE="${1:-2026-05-19}"
DAYS="${2:-5}"
SIM_DIR="${3:-data/simulations/week-${START_DATE}-${DAYS}d}"

cd "$(dirname "$0")/.."
rm -rf "$SIM_DIR"
mkdir -p "$SIM_DIR/reports"

if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
else
  PNPM=(npx pnpm@10.12.1)
fi

current="$START_DATE"
for _ in $(seq 1 "$DAYS"); do
  echo "=== ${current} noon ==="
  DATABASE_URL="./$SIM_DIR/industry-radar.sqlite" \
  REPORT_OUTPUT_DIR="./$SIM_DIR/reports" \
  "${PNPM[@]}" report:run -- --type noon --date "$current" --mock

  echo "=== ${current} night ==="
  DATABASE_URL="./$SIM_DIR/industry-radar.sqlite" \
  REPORT_OUTPUT_DIR="./$SIM_DIR/reports" \
  "${PNPM[@]}" report:run -- --type night --date "$current" --mock

  current="$(date -j -f "%Y-%m-%d" -v+1d "$current" "+%Y-%m-%d" 2>/dev/null || date -d "$current + 1 day" "+%Y-%m-%d")"
done

echo "Simulation database: $SIM_DIR/industry-radar.sqlite"
echo "Simulation reports: $SIM_DIR/reports"
