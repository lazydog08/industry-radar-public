#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
else
  PNPM=(npx pnpm@10.12.1)
fi

export DATABASE_URL="${DATABASE_URL:-./data/runtime/demo.sqlite}"
export REPORT_OUTPUT_DIR="${REPORT_OUTPUT_DIR:-./data/runtime/reports}"
export PORT="${PORT:-3877}"

TODAY="${DEMO_DATE:-$(date +%F)}"

"${PNPM[@]}" kb:init
"${PNPM[@]}" report:run -- --type noon --date "$TODAY" --mock
"${PNPM[@]}" report:run -- --type night --date "$TODAY" --mock
"${PNPM[@]}" report:weekly
"${PNPM[@]}" report:monthly

echo
echo "演示数据库：$DATABASE_URL"
echo "演示报告目录：$REPORT_OUTPUT_DIR"
echo "Web UI：http://localhost:${PORT}"

if [[ "${1:-}" == "--serve" ]]; then
  exec "${PNPM[@]}" serve
fi

echo
echo "启动 Web UI："
echo "DATABASE_URL=$DATABASE_URL REPORT_OUTPUT_DIR=$REPORT_OUTPUT_DIR PORT=$PORT pnpm serve"
