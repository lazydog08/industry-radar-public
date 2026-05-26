#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${1:-}" == "--" ]]; then
  shift
fi

ACTION="${1:-dry-run}"
RUN_TYPE="${RUN_TYPE:-${NAS_RUN_TYPE:-noon}}"
RUN_DATE="${NAS_RUN_DATE:-$(date +%F)}"
LINES="${LINES:-80}"
LOG_DIR="${NAS_LOG_DIR:-./logs/nas-daily}"

case "$ACTION" in
  dry-run|success|failure|logs)
    ;;
  *)
    echo "Usage: scripts/nas-bark-test.sh [dry-run|success|failure|logs]" >&2
    exit 2
    ;;
esac

if ! [[ "$LINES" =~ ^[0-9]+$ ]] || [[ "$LINES" -lt 1 ]]; then
  echo "LINES must be a positive integer." >&2
  exit 2
fi

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0

  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
    [[ "$line" == export\ * ]] && line="${line#export }"
    [[ "$line" == *=* ]] || continue

    key="${line%%=*}"
    value="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#"${key%%[![:space:]]*}"}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue

    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ "$value" == \"*\" && "$value" == *\" && "${#value}" -ge 2 ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "${#value}" -ge 2 ]]; then
      value="${value:1:${#value}-2}"
    fi
    export "$key=$value"
  done < "$file"
}

load_env_file ".env"
load_env_file ".env.local"

LOG_DIR="${NAS_LOG_DIR:-$LOG_DIR}"

if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
else
  PNPM=(npx pnpm@10.12.1)
fi

mask_secret() {
  local value="${1:-}"
  if [[ -z "$value" ]]; then
    printf 'not-set'
    return
  fi
  if [[ "${#value}" -le 8 ]]; then
    printf '%s' '***'
    return
  fi
  printf '%s...%s' "${value:0:4}" "${value: -4}"
}

mask_url() {
  local value="${1:-}"
  if [[ -z "$value" ]]; then
    printf 'not-set'
    return
  fi
  if [[ "$value" =~ ^https?://[^/]+/?$ ]]; then
    printf '%s' 'set-but-missing-key-path'
    return
  fi
  if [[ "$value" =~ ^(https?://[^/]+/)([^/?#]+)(.*)$ ]]; then
    printf '%s%s%s' "${BASH_REMATCH[1]}" "$(mask_secret "${BASH_REMATCH[2]}")" "${BASH_REMATCH[3]}"
    return
  fi
  mask_secret "$value"
}

sanitize_stream() {
  sed -E \
    -e 's#(BARK_KEY=)[^[:space:]]+#\1***#g' \
    -e 's#(BARK_NOTIFY_URL=https?://[^/]+/)[^[:space:]/?#]+#\1***#g' \
    -e 's#(https?://api\.day\.app/)[^[:space:]/?#]+#\1***#g'
}

print_config() {
  echo "Bark config check:"
  echo "  BARK_KEY=$(mask_secret "${BARK_KEY:-}")"
  echo "  BARK_NOTIFY_URL=$(mask_url "${BARK_NOTIFY_URL:-}")"
  echo "  BARK_PUBLIC_URL=${BARK_PUBLIC_URL:-not-set}"
  echo "  BARK_SOUND=${BARK_SOUND:-not-set}"
  echo "  BARK_TIMEOUT_MS=${BARK_TIMEOUT_MS:-10000}"
  echo "  SEND_REAL_BARK=${SEND_REAL_BARK:-false}"
}

run_notify() {
  local status="$1"
  local dry_run_value="true"
  if [[ "${SEND_REAL_BARK:-false}" == "true" ]]; then
    dry_run_value="${BARK_DRY_RUN:-false}"
  fi

  BARK_DRY_RUN="$dry_run_value" \
  BARK_STATUS="$status" \
  BARK_RUN_TYPE="$RUN_TYPE" \
  BARK_NEW_COUNT="${BARK_NEW_COUNT:-12}" \
  BARK_HIGH_COUNT="${BARK_HIGH_COUNT:-3}" \
  NAS_RUN_DATE="$RUN_DATE" \
  BARK_MESSAGE="NAS Bark test: type=${RUN_TYPE}, date=${RUN_DATE}, new=${BARK_NEW_COUNT:-12}, high=${BARK_HIGH_COUNT:-3}" \
  "${PNPM[@]}" notify:bark | sanitize_stream
}

show_logs() {
  echo "NAS daily log directory: ${LOG_DIR}"
  if [[ ! -d "$LOG_DIR" ]]; then
    echo "Log directory does not exist yet."
    return 0
  fi

  local files=()
  local file
  while IFS= read -r file; do
    files+=("$file")
  done < <(find "$LOG_DIR" -maxdepth 1 -type f -name '*.log' -print | sort | tail -10)
  if [[ "${#files[@]}" -eq 0 ]]; then
    echo "No .log files found."
    return 0
  fi

  echo "Recent log files:"
  printf '  %s\n' "${files[@]}"
  echo
  local newest_index=$(( ${#files[@]} - 1 ))
  echo "Last ${LINES} lines from the newest log:"
  tail -n "$LINES" "${files[$newest_index]}" | sanitize_stream
}

case "$ACTION" in
  dry-run|success)
    print_config
    echo
    run_notify "success"
    ;;
  failure)
    print_config
    echo
    run_notify "failed"
    ;;
  logs)
    show_logs
    ;;
esac
