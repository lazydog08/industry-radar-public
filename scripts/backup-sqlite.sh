#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p backups

STAMP="$(date +%F-%H%M%S)"
if [[ -f data/industry-radar.sqlite ]]; then
  cp data/industry-radar.sqlite "backups/industry-radar-${STAMP}.sqlite"
fi

if [[ -d data/reports ]]; then
  tar -czf "backups/reports-${STAMP}.tar.gz" data/reports
fi

echo "backup complete: backups/*-${STAMP}*"
