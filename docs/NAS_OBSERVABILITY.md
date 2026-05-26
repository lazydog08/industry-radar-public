# NAS 告警与日志排障

这份文档用于在 NAS 上验证 Bark 通知、模拟成功/失败、查看最近一次日更日志。它不替代正式任务；正式日更仍由 `scripts/nas-daily-update.sh` 执行。

## Bark 通知字段

`pnpm notify:bark` 发送的正文只包含这些字段：

- `状态`：成功或失败。
- `日期/类型`：运行日期和 `morning`、`noon`、`night`。
- `新增条数`：本次报告或静态数据里解析到的新增数量。
- `高分条数`：重要事件数量。
- `网页地址`：`BARK_SITE_URL`、`BARK_PUBLIC_URL` 或 `PUBLIC_SITE_URL`。

标题为 `行业情报更新完成` 或 `行业情报更新失败`。点击通知打开的地址来自公开网页配置，不读取 SQLite。

## 隐私边界

Bark 推送正文不会包含：

- `BARK_KEY` 或完整 `BARK_NOTIFY_URL`。
- `.env`、`.env.local` 的内容。
- 数据库路径、日志路径、本机绝对路径。
- SQLite 内容、原始抓取数据、私有报告全文。

排障脚本会读取 `.env` 和 `.env.local`，但展示配置时会脱敏 `BARK_KEY` 和 `BARK_NOTIFY_URL`。日志查看动作只读取 `logs/nas-daily` 下的 `.log` 文件，不打印 `.env` 文件。

## 测试命令

默认是 dry-run，不会真实推送到 iPhone：

```bash
bash scripts/nas-bark-test.sh
```

模拟成功通知：

```bash
bash scripts/nas-bark-test.sh success
```

模拟失败通知：

```bash
bash scripts/nas-bark-test.sh failure
```

以上三个动作都会调用 `pnpm notify:bark`。默认会强制 `BARK_DRY_RUN=true`，只打印将发送的标题和正文。只有显式设置下面的变量才会真实发送：

```bash
SEND_REAL_BARK=true bash scripts/nas-bark-test.sh success
SEND_REAL_BARK=true bash scripts/nas-bark-test.sh failure
```

可临时覆盖运行类型和日期：

```bash
RUN_TYPE=night NAS_RUN_DATE=2026-05-26 bash scripts/nas-bark-test.sh success
```

## 查看失败日志

查看最近的 NAS 日志文件和最新日志末尾：

```bash
bash scripts/nas-bark-test.sh logs
```

默认显示最新日志最后 80 行，包括 `nas-daily-update.sh` 自己生成的运行日志和 cron 包装日志。cron 包装日志按天命名为 `cron-类型-YYYYMMDD.log`，由定时任务脚本按保留天数清理。需要更多上下文时：

```bash
LINES=200 bash scripts/nas-bark-test.sh logs
```

正式日更失败时，优先看最新日志里的这些信息：

- `FAILED stage=... exit=...`：失败阶段和退出码。
- `Bark notify failed`：Bark 网络、Key 或超时问题。
- `Missing package script`：本地代码版本和脚本配置不一致。
- `Published static data` 或 `Existing published data was not deleted`：确认旧网页数据是否被保留。

## NAS 定时任务和 Bark 的关系

NAS cron 只负责按时间启动日更脚本，例如：

```bash
0 12 * * * cd /volume1/docker/industry-radar && /bin/bash scripts/nas-daily-update.sh noon >> logs/nas-cron.log 2>&1
```

`scripts/nas-daily-update.sh` 负责生成报告、导出静态数据、发布网页，并在成功或失败时调用 `pnpm notify:bark`。Bark 只负责把运行结果推送到 iPhone；它不是调度器，也不参与数据生成或发布。

如果 Bark 发送失败，日更脚本会把失败原因写进本地日志，并保留已经生成或已经发布的数据。排障顺序建议是：

1. 先运行 `bash scripts/nas-bark-test.sh logs` 看最新失败阶段。
2. 再运行 `bash scripts/nas-bark-test.sh failure` 确认失败通知文案。
3. 确认文案无误后，用 `SEND_REAL_BARK=true bash scripts/nas-bark-test.sh success` 做一次真实到达测试。
