#!/usr/bin/env bash
set -euo pipefail

TYPE="${1:-noon}"
cd "$(dirname "$0")/.."

if [[ "$TYPE" != "noon" && "$TYPE" != "night" ]]; then
  echo "TYPE must be noon or night" >&2
  exit 1
fi

pnpm "report:${TYPE}"
