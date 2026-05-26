#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_TYPE="${1:-${NAS_RUN_TYPE:-noon}}"
case "$RUN_TYPE" in
  morning)
    CLI_REPORT_TYPE="noon"
    ;;
  noon)
    CLI_REPORT_TYPE="noon"
    ;;
  night)
    CLI_REPORT_TYPE="night"
    ;;
  *)
    echo "Usage: scripts/nas-daily-update.sh [morning|noon|night]" >&2
    exit 2
    ;;
esac

if [[ -f .env.local ]]; then
  # shellcheck disable=SC1091
  source .env.local
elif [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
fi

export DATABASE_URL="${DATABASE_URL:-./data/industry-radar.sqlite}"
export REPORT_OUTPUT_DIR="${REPORT_OUTPUT_DIR:-./data/reports}"
export PUBLIC_DATA_DIR="${PUBLIC_DATA_DIR:-./data/public}"

RUN_DATE="${NAS_RUN_DATE:-$(date +%F)}"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="${NAS_LOG_DIR:-./logs/nas-daily}"
LOG_FILE="${LOG_DIR}/${RUN_DATE}-${RUN_TYPE}-${STAMP}.log"
CURRENT_STAGE="bootstrap"
mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
else
  PNPM=(npx pnpm@10.12.1)
fi

NEW_COUNT="unknown"
HIGH_COUNT="unknown"
PUBLISHED_TO="${PUBLISH_DIR:-}"

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

has_pnpm_script() {
  local script_name="$1"
  node -e 'const pkg=require("./package.json"); process.exit(pkg.scripts && pkg.scripts[process.argv[1]] ? 0 : 1)' "$script_name" >/dev/null 2>&1
}

notify_bark() {
  local status="$1"
  local message="$2"
  if has_pnpm_script "notify:bark"; then
    BARK_STATUS="$status" \
    BARK_MESSAGE="$message" \
    BARK_LOG_FILE="$LOG_FILE" \
    BARK_RUN_TYPE="$RUN_TYPE" \
    "${PNPM[@]}" notify:bark || log "Bark notify failed; local pipeline result is kept."
    return
  fi

  if [[ -n "${BARK_NOTIFY_URL:-}" || -n "${BARK_KEY:-}" ]]; then
    log "Bark is configured, but notify:bark is not implemented yet. TASK-04 should consume BARK_NOTIFY_URL/BARK_KEY."
  else
    log "Bark notify skipped: BARK_NOTIFY_URL/BARK_KEY is not configured."
  fi
}

on_error() {
  local exit_code=$?
  log "FAILED stage=${CURRENT_STAGE} exit=${exit_code}"
  notify_bark "failed" "NAS update failed at ${CURRENT_STAGE}; log=${LOG_FILE}"
  log "Existing published data was not deleted."
  exit "$exit_code"
}
trap on_error ERR

run_stage() {
  local stage="$1"
  shift
  CURRENT_STAGE="$stage"
  log "START ${stage}"
  "$@"
  log "DONE ${stage}"
}

run_report() {
  local args=(report:run -- --type "$CLI_REPORT_TYPE" --date "$RUN_DATE")
  if [[ "${NAS_MOCK_FALLBACK:-false}" == "true" ]]; then
    args+=(--mock-fallback)
  fi
  "${PNPM[@]}" "${args[@]}"
}

run_export_site() {
  if ! has_pnpm_script "export:site"; then
    log "Missing package script: export:site. TASK-01 must provide the static JSON exporter before NAS publishing can complete."
    return 12
  fi
  mkdir -p "$PUBLIC_DATA_DIR"
  "${PNPM[@]}" export:site
}

publish_public_data() {
  if [[ -z "${PUBLISH_DIR:-}" ]]; then
    log "PUBLISH_DIR is not set; skipping publish stage."
    return 0
  fi
  if [[ ! -d "$PUBLIC_DATA_DIR" ]]; then
    log "PUBLIC_DATA_DIR does not exist after export: ${PUBLIC_DATA_DIR}"
    return 13
  fi

  mkdir -p "$PUBLISH_DIR"
  local tmp_dir="${PUBLISH_DIR%/}/.industry-radar-publish-${STAMP}"
  rm -rf "$tmp_dir"
  mkdir -p "$tmp_dir"
  cp -R "${PUBLIC_DATA_DIR%/}/." "$tmp_dir/"
  find "$tmp_dir" -mindepth 1 -maxdepth 1 -exec cp -R {} "$PUBLISH_DIR/" \;
  rm -rf "$tmp_dir"
  log "Published static data to ${PUBLISH_DIR}. Existing files outside this export were kept."
}

collect_stats() {
  local report_md="${REPORT_OUTPUT_DIR%/}/${RUN_DATE}-${CLI_REPORT_TYPE}.md"
  if [[ -f "$report_md" ]]; then
    local parsed_new parsed_high
    parsed_new="$(grep -E '^- 新增事件数：' "$report_md" | head -n 1 | sed -E 's/.*：([0-9]+).*/\1/' || true)"
    parsed_high="$(grep -E '^- 重要事件数：' "$report_md" | head -n 1 | sed -E 's/.*：([0-9]+).*/\1/' || true)"
    [[ -n "$parsed_new" ]] && NEW_COUNT="$parsed_new"
    [[ -n "$parsed_high" ]] && HIGH_COUNT="$parsed_high"
    return 0
  fi

  local overview_json="${PUBLIC_DATA_DIR%/}/overview.json"
  if [[ -f "$overview_json" ]]; then
    local parsed
    parsed="$(node -e '
const fs=require("node:fs");
const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
const metrics=data.metrics || {};
const events=Array.isArray(data.events) ? data.events : [];
const high=metrics.important ?? events.filter((event) => Number(event.radar_score || event.importance_score || 0) >= 70).length;
const recent=metrics.recentEvents ?? events.length;
console.log(`${recent} ${high}`);
' "$overview_json")"
    NEW_COUNT="${parsed%% *}"
    HIGH_COUNT="${parsed##* }"
  fi
}

log "NAS daily update started: type=${RUN_TYPE}, cli_type=${CLI_REPORT_TYPE}, date=${RUN_DATE}"
log "DATABASE_URL=${DATABASE_URL}"
log "REPORT_OUTPUT_DIR=${REPORT_OUTPUT_DIR}"
log "PUBLIC_DATA_DIR=${PUBLIC_DATA_DIR}"
[[ -n "${PUBLISH_DIR:-}" ]] && log "PUBLISH_DIR=${PUBLISH_DIR}"

run_stage "generate report" run_report
run_stage "export static data" run_export_site
run_stage "publish static data" publish_public_data
run_stage "collect stats" collect_stats

UPDATED_AT="$(date '+%F %T %Z')"
SUCCESS_MESSAGE="NAS update success: type=${RUN_TYPE}, date=${RUN_DATE}, new=${NEW_COUNT}, high=${HIGH_COUNT}, updated_at=${UPDATED_AT}, publish=${PUBLISHED_TO:-not-set}"
log "$SUCCESS_MESSAGE"
notify_bark "success" "$SUCCESS_MESSAGE"
log "Log file: ${LOG_FILE}"
