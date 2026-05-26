#!/usr/bin/env bash
# QNAP 专用 cron 安装脚本。
# QNAP 用户 crontab 在重启后会丢失，必须写入 /etc/config/crontab
# 并执行 crontab /etc/config/crontab 才能在重启后保留。
#
# 用法：
#   bash scripts/qnap-install-cron.sh            # 正式安装
#   bash scripts/qnap-install-cron.sh --dry-run  # 仅打印，不写文件
#
# 环境变量：
#   QNAP_CRONTAB_PATH  覆盖 crontab 文件路径，默认 /etc/config/crontab
#                      （本地测试时可指向临时文件）
#   其他变量与 nas-schedule.sh 相同（APP_DIR、MORNING_TIME 等）

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QNAP_CRONTAB_PATH="${QNAP_CRONTAB_PATH:-/etc/config/crontab}"

MARKER_BEGIN="# >>> industry-radar nas-schedule managed block"
MARKER_END="# <<< industry-radar nas-schedule managed block"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

# 从 nas-schedule.sh print-cron 获取 cron 块
get_cron_block() {
  bash "${SCRIPT_DIR}/nas-schedule.sh" print-cron
}

# 从文件内容中移除已有的 managed block
remove_managed_block() {
  awk -v begin="$MARKER_BEGIN" -v end="$MARKER_END" '
    $0 == begin { in_block = 1; next }
    $0 == end   { in_block = 0; next }
    !in_block   { print }
  '
}

main() {
  # 获取新的 cron 块
  local new_block
  new_block="$(get_cron_block)"

  if [[ "$DRY_RUN" == "true" ]]; then
    printf '=== DRY-RUN: 以下内容将被写入 %s ===\n\n' "$QNAP_CRONTAB_PATH"

    # 模拟写入后的文件内容
    if [[ -f "$QNAP_CRONTAB_PATH" ]]; then
      local existing stripped
      existing="$(cat "$QNAP_CRONTAB_PATH")"
      stripped="$(printf '%s\n' "$existing" | remove_managed_block | sed '/^[[:space:]]*$/{$d;}')"
      if [[ -n "$stripped" ]]; then
        printf '%s\n\n%s\n' "$stripped" "$new_block"
      else
        printf '%s\n' "$new_block"
      fi
    else
      printf '%s\n' "$new_block"
    fi

    printf '\n=== DRY-RUN 结束，未写入任何文件 ===\n'
    return 0
  fi

  # 检查是否有写入权限
  local crontab_dir
  crontab_dir="$(dirname "$QNAP_CRONTAB_PATH")"
  if [[ ! -d "$crontab_dir" ]]; then
    die "目录不存在: ${crontab_dir}。请确认在 QNAP 系统上运行，或用 QNAP_CRONTAB_PATH 指定测试路径。"
  fi

  if [[ ! -w "$crontab_dir" ]] && [[ -f "$QNAP_CRONTAB_PATH" && ! -w "$QNAP_CRONTAB_PATH" ]]; then
    die "无写入权限: ${QNAP_CRONTAB_PATH}。请以 admin 身份运行或使用 sudo。"
  fi

  # 读取现有 crontab 文件（如果存在）
  local existing=""
  if [[ -f "$QNAP_CRONTAB_PATH" ]]; then
    existing="$(cat "$QNAP_CRONTAB_PATH")"
  fi

  # 移除旧的 managed block，追加新块
  local stripped next_crontab
  stripped="$(printf '%s\n' "$existing" | remove_managed_block | sed '/^[[:space:]]*$/{$d;}')"

  if [[ -n "$stripped" ]]; then
    next_crontab="$(printf '%s\n\n%s\n' "$stripped" "$new_block")"
  else
    next_crontab="$(printf '%s\n' "$new_block")"
  fi

  # 写入 /etc/config/crontab
  printf '%s\n' "$next_crontab" > "$QNAP_CRONTAB_PATH"
  log "已写入 cron 块到 ${QNAP_CRONTAB_PATH}"

  # 重新加载 crontab
  if command -v crontab >/dev/null 2>&1; then
    crontab "$QNAP_CRONTAB_PATH"
    log "已执行 crontab ${QNAP_CRONTAB_PATH}，定时任务立即生效。"
  else
    log "WARNING: 找不到 crontab 命令，请手动执行: crontab ${QNAP_CRONTAB_PATH}"
  fi

  cat <<MSG

安装成功。
  写入文件: ${QNAP_CRONTAB_PATH}
  QNAP 重启后此配置不会丢失，因为系统会从 /etc/config/crontab 恢复 cron。

验证：crontab -l | grep industry-radar
卸载：bash scripts/nas-schedule.sh uninstall 后再执行 crontab ${QNAP_CRONTAB_PATH}
MSG
}

main "$@"
