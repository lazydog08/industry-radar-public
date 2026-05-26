#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${APP_DIR:-$DEFAULT_APP_DIR}"
NAS_LOG_DIR="${NAS_LOG_DIR:-${APP_DIR}/logs/nas-daily}"
TIMEZONE="${TIMEZONE:-Asia/Shanghai}"
CRON_LOG_RETENTION_DAYS="${CRON_LOG_RETENTION_DAYS:-14}"

MORNING_TIME="${MORNING_TIME:-08:10}"
NOON_TIME="${NOON_TIME:-12:10}"
NIGHT_TIME="${NIGHT_TIME:-22:10}"

MARKER_BEGIN="# >>> industry-radar nas-schedule managed block"
MARKER_END="# <<< industry-radar nas-schedule managed block"

usage() {
  cat <<'USAGE'
Usage: scripts/nas-schedule.sh install|status|uninstall|print-cron

Environment:
  APP_DIR       Project directory. Defaults to this repository path.
  NAS_LOG_DIR   Log directory. Defaults to APP_DIR/logs/nas-daily.
  TIMEZONE      Cron timezone note. Defaults to Asia/Shanghai.
  MORNING_TIME  Morning run time, HH:MM. Defaults to 08:10.
  NOON_TIME     Noon run time, HH:MM. Defaults to 12:10.
  NIGHT_TIME    Night run time, HH:MM. Defaults to 22:10.
  CRON_LOG_RETENTION_DAYS  Delete cron wrapper logs older than this. Defaults to 14.
USAGE
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

shell_quote() {
  local value="$1"
  printf "'%s'" "${value//\'/\'\\\'\'}"
}

validate_time() {
  local name="$1"
  local value="$2"
  if [[ ! "$value" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
    die "${name} must use HH:MM in 24-hour format, got: ${value}"
  fi
}

validate_positive_integer() {
  local name="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[0-9]+$ || "$value" -lt 1 ]]; then
    die "${name} must be a positive integer, got: ${value}"
  fi
}

cron_line() {
  local run_type="$1"
  local run_time="$2"
  local hour minute app_dir log_dir cron_log_pattern daily_log_pattern log_redirect
  hour="${run_time%%:*}"
  minute="${run_time##*:}"
  app_dir="$(shell_quote "$APP_DIR")"
  log_dir="$(shell_quote "$NAS_LOG_DIR")"
  cron_log_pattern="$(shell_quote "cron-${run_type}-*.log")"
  daily_log_pattern="$(shell_quote "????-??-??-${run_type}-*.log")"
  log_redirect="${log_dir}/cron-${run_type}-\$(date +\\%Y\\%m\\%d).log"

  printf '%s %s * * * mkdir -p %s && find %s -maxdepth 1 -type f -name %s -mtime +%s -delete >/dev/null 2>&1 && find %s -maxdepth 1 -type f -name %s -mtime +%s -delete >/dev/null 2>&1 && cd %s && NAS_LOG_DIR=%s /bin/bash scripts/nas-daily-update.sh %s >> %s 2>&1\n' \
    "$minute" \
    "$hour" \
    "$log_dir" \
    "$log_dir" \
    "$cron_log_pattern" \
    "$CRON_LOG_RETENTION_DAYS" \
    "$log_dir" \
    "$daily_log_pattern" \
    "$CRON_LOG_RETENTION_DAYS" \
    "$app_dir" \
    "$log_dir" \
    "$run_type" \
    "$log_redirect"
}

print_cron_block() {
  validate_time MORNING_TIME "$MORNING_TIME"
  validate_time NOON_TIME "$NOON_TIME"
  validate_time NIGHT_TIME "$NIGHT_TIME"
  validate_positive_integer CRON_LOG_RETENTION_DAYS "$CRON_LOG_RETENTION_DAYS"

  printf '%s\n' "$MARKER_BEGIN"
  printf '# Project: %s\n' "$APP_DIR"
  printf '# Timezone: %s. Ensure the NAS system timezone is Asia/Shanghai if CRON_TZ is unsupported.\n' "$TIMEZONE"
  printf '# Cron wrapper logs are split by day and older than %s days are deleted.\n' "$CRON_LOG_RETENTION_DAYS"
  printf 'CRON_TZ=%s\n' "$TIMEZONE"
  cron_line morning "$MORNING_TIME"
  cron_line noon "$NOON_TIME"
  cron_line night "$NIGHT_TIME"
  printf '%s\n' "$MARKER_END"
}

crontab_available() {
  command -v crontab >/dev/null 2>&1
}

current_crontab() {
  crontab -l 2>/dev/null || true
}

remove_managed_block() {
  awk -v begin="$MARKER_BEGIN" -v end="$MARKER_END" '
    $0 == begin { in_block = 1; next }
    $0 == end { in_block = 0; next }
    !in_block { print }
  '
}

install_cron() {
  if ! crontab_available; then
    cat >&2 <<'MSG'
crontab command is not available on this NAS shell.
Copy the cron block below into the NAS task scheduler or the system crontab manually:
MSG
    print_cron_block
    return 0
  fi

  local existing new_block next_crontab
  existing="$(current_crontab)"
  new_block="$(print_cron_block)"
  next_crontab="$(printf '%s\n' "$existing" | remove_managed_block | sed '/^[[:space:]]*$/{$d;}')"

  printf 'Installing cron block. If this NAS ignores CRON_TZ, set the NAS system timezone to %s.\n' "$TIMEZONE"
  if [[ -n "$next_crontab" ]]; then
    printf '%s\n\n%s\n' "$next_crontab" "$new_block" | crontab -
  else
    printf '%s\n' "$new_block" | crontab -
  fi

  printf 'Installed NAS schedule for %s\n' "$APP_DIR"
  printf 'Logs: %s\n' "$NAS_LOG_DIR"
}

uninstall_cron() {
  if ! crontab_available; then
    cat >&2 <<'MSG'
crontab command is not available on this NAS shell.
Remove only the block between these markers from the NAS task scheduler:
MSG
    printf '%s\n%s\n' "$MARKER_BEGIN" "$MARKER_END"
    return 0
  fi

  local existing next_crontab
  existing="$(current_crontab)"
  next_crontab="$(printf '%s\n' "$existing" | remove_managed_block | sed '/^[[:space:]]*$/{$d;}')"
  if [[ -z "$next_crontab" ]]; then
    crontab -r 2>/dev/null || true
  else
    printf '%s\n' "$next_crontab" | crontab -
  fi
  printf 'Uninstalled NAS schedule block for %s\n' "$APP_DIR"
}

status_cron() {
  if ! crontab_available; then
    cat >&2 <<'MSG'
crontab command is not available on this NAS shell.
Use print-cron to get copyable cron content, or check the NAS task scheduler panel.
MSG
    return 0
  fi

  local existing
  existing="$(current_crontab)"
  if printf '%s\n' "$existing" | grep -Fqx "$MARKER_BEGIN"; then
    printf 'Installed NAS schedule block:\n\n'
    printf '%s\n' "$existing" | awk -v begin="$MARKER_BEGIN" -v end="$MARKER_END" '
      $0 == begin { in_block = 1 }
      in_block { print }
      $0 == end { in_block = 0 }
    '
  else
    printf 'NAS schedule block is not installed for this user crontab.\n\n'
    printf 'Expected cron block:\n\n'
    print_cron_block
  fi
}

main() {
  if [[ "${1:-}" == "--" ]]; then
    shift
  fi

  local action="${1:-}"
  case "$action" in
    install)
      install_cron
      ;;
    status)
      status_cron
      ;;
    uninstall)
      uninstall_cron
      ;;
    print-cron)
      print_cron_block
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
