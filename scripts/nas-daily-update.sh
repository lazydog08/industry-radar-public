#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${1:-}" == "--" ]]; then
  shift
fi

RUN_TYPE="${1:-${NAS_RUN_TYPE:-noon}}"
case "$RUN_TYPE" in
  morning)
    CLI_REPORT_TYPE="morning"
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
    log "Bark is configured, but package script notify:bark is missing. Notification was skipped."
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

  local source_dir publish_dir publish_parent publish_base next_dir previous_dir
  source_dir="${PUBLIC_DATA_DIR%/}"
  publish_dir="${PUBLISH_DIR%/}"
  publish_parent="$(dirname -- "$publish_dir")"
  publish_base="$(basename -- "$publish_dir")"

  if [[ -z "$publish_base" || "$publish_base" == "." || "$publish_dir" == "/" ]]; then
    log "Refusing unsafe PUBLISH_DIR: ${PUBLISH_DIR}"
    return 14
  fi

  mkdir -p "$publish_parent"
  next_dir="${publish_parent}/${publish_base}.next-${STAMP}"
  previous_dir="${publish_parent}/${publish_base}.previous"

  remove_publish_sibling() {
    local target="$1"
    local target_parent target_base
    target_parent="$(dirname -- "$target")"
    target_base="$(basename -- "$target")"
    if [[ "$target_parent" != "$publish_parent" ]]; then
      log "Refusing to remove path outside PUBLISH_DIR parent: ${target}"
      return 17
    fi
    case "$target_base" in
      "${publish_base}.next-"*|"${publish_base}.previous")
        rm -rf -- "$target"
        ;;
      *)
        log "Refusing to remove unrelated publish path: ${target}"
        return 17
        ;;
    esac
  }

  if [[ -e "$next_dir" ]]; then
    log "Removing stale publish candidate: ${next_dir}"
    remove_publish_sibling "$next_dir" || return 18
  fi

  log "Preparing publish candidate: ${next_dir}"
  mkdir -p "$next_dir"
  cp -R "${source_dir}/." "$next_dir/" || {
    log "Failed to copy public data into publish candidate; old published data was left untouched."
    remove_publish_sibling "$next_dir" || true
    return 18
  }

  if [[ ! -e "$publish_dir" ]]; then
    mv "$next_dir" "$publish_dir"
    PUBLISHED_TO="$publish_dir"
    log "Published static data to ${publish_dir} with directory move. No previous publish directory existed."
    return 0
  fi

  if [[ -e "$previous_dir" ]]; then
    log "Removing previous backup before switch: ${previous_dir}"
    remove_publish_sibling "$previous_dir" || return 18
  fi

  if mv "$publish_dir" "$previous_dir"; then
    if mv "$next_dir" "$publish_dir"; then
      PUBLISHED_TO="$publish_dir"
      log "Published static data to ${publish_dir} by directory switch. Previous version kept at ${previous_dir}."
      return 0
    fi

    log "Directory switch failed after preserving previous data; restoring ${publish_dir}."
    if [[ ! -e "$publish_dir" && -e "$previous_dir" ]]; then
      mv "$previous_dir" "$publish_dir" || true
    fi
    remove_publish_sibling "$next_dir"
    return 15
  fi

  log "Directory switch is not available for ${publish_dir}; falling back to rsync --delete."
  if ! command -v rsync >/dev/null 2>&1; then
    remove_publish_sibling "$next_dir"
    log "rsync is unavailable; old published data was left untouched."
    return 16
  fi

  rsync -a --delete "${next_dir}/" "${publish_dir}/"
  remove_publish_sibling "$next_dir"
  PUBLISHED_TO="$publish_dir"
  log "Published static data to ${publish_dir} with rsync fallback. This fallback is not strictly atomic."
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
