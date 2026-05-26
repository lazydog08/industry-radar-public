#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_SOURCE_DIR="${WEB_SOURCE_DIR:-${ROOT_DIR}/src/web}"
PUBLIC_DATA_SOURCE="${PUBLIC_DATA_DIR:-${ROOT_DIR}/public-data}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3888}"
TEMP_PREVIEW_DIR=""

if [[ -n "${WEB_PREVIEW_DIR:-}" ]]; then
  PREVIEW_DIR="$WEB_PREVIEW_DIR"
elif [[ -n "${WEB_ROOT:-}" ]]; then
  PREVIEW_DIR="$WEB_ROOT"
else
  TEMP_PREVIEW_DIR="$(mktemp -d "${TMPDIR:-/tmp}/industry-radar-web.XXXXXX")"
  PREVIEW_DIR="$TEMP_PREVIEW_DIR"
fi

cleanup() {
  if [[ -n "$TEMP_PREVIEW_DIR" && -d "$TEMP_PREVIEW_DIR" ]]; then
    rm -rf -- "$TEMP_PREVIEW_DIR"
  fi
}
trap cleanup EXIT

fail() {
  printf 'nas-web-preview: %s\n' "$*" >&2
  exit 1
}

require_file() {
  local path="$1"
  [[ -f "$path" ]] || fail "missing required web file: ${path}"
}

validate_port() {
  if [[ ! "$PORT" =~ ^[0-9]+$ || "$PORT" -lt 1 || "$PORT" -gt 65535 ]]; then
    fail "PORT must be an integer between 1 and 65535, got: ${PORT}"
  fi
}

abs_dir() {
  local path="$1"
  (cd "$path" && pwd -P)
}

case "$PREVIEW_DIR" in
  ""|"/")
    fail "refusing unsafe preview directory: ${PREVIEW_DIR:-<empty>}"
    ;;
esac

command -v python3 >/dev/null 2>&1 || fail "python3 is required for preview; install Python 3 or run the site from an existing static web server."
validate_port

[[ -d "$WEB_SOURCE_DIR" ]] || fail "web source directory does not exist: ${WEB_SOURCE_DIR}"
require_file "${WEB_SOURCE_DIR}/index.html"
require_file "${WEB_SOURCE_DIR}/styles.css"
require_file "${WEB_SOURCE_DIR}/app.js"
require_file "${WEB_SOURCE_DIR}/filter-summary.js"

[[ -d "$PUBLIC_DATA_SOURCE" ]] || fail "public data directory does not exist: ${PUBLIC_DATA_SOURCE}. Set PUBLIC_DATA_DIR=/path/to/public-data after running the static export."
require_file "${PUBLIC_DATA_SOURCE}/overview.json"

mkdir -p "$PREVIEW_DIR"
PREVIEW_PUBLIC_DIR="${PREVIEW_DIR}/public-data"
PREVIEW_PUBLIC_ABS="$(mkdir -p "$PREVIEW_PUBLIC_DIR" && abs_dir "$PREVIEW_PUBLIC_DIR")"
PUBLIC_DATA_ABS="$(abs_dir "$PUBLIC_DATA_SOURCE")"

case "$PUBLIC_DATA_ABS" in
  "$PREVIEW_PUBLIC_ABS"|"$PREVIEW_PUBLIC_ABS"/*)
    fail "PUBLIC_DATA_DIR must not be the same as, or inside, the preview public-data directory: ${PREVIEW_PUBLIC_DIR}"
    ;;
esac

cp "${WEB_SOURCE_DIR}/index.html" "$PREVIEW_DIR/index.html"
cp "${WEB_SOURCE_DIR}/styles.css" "$PREVIEW_DIR/styles.css"
for js_file in "${WEB_SOURCE_DIR}"/*.js; do
  cp "$js_file" "$PREVIEW_DIR/$(basename "$js_file")"
done

rm -rf -- "$PREVIEW_PUBLIC_DIR"
mkdir -p "$PREVIEW_PUBLIC_DIR"
cp -R "${PUBLIC_DATA_SOURCE%/}/." "${PREVIEW_PUBLIC_DIR}/"

printf 'Preview root: %s\n' "$PREVIEW_DIR"
printf 'Public data:  %s\n' "$PUBLIC_DATA_SOURCE"
printf 'URL:          http://%s:%s/\n' "$HOST" "$PORT"
printf 'Stop:         Ctrl-C\n'

cd "$PREVIEW_DIR"
exec python3 -m http.server "$PORT" --bind "$HOST"
