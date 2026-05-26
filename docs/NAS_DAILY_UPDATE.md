# NAS 每日自动更新

本流程用于在 NAS 上无人值守执行：

```text
抓取公开数据 -> 入库和评分 -> 生成报告 -> 导出线上 JSON -> 发布到网页目录 -> 预留 Bark 推送
```

脚本入口：

```bash
scripts/nas-daily-update.sh [morning|noon|night]
```

也可以通过 npm script 调用：

```bash
pnpm nas:daily -- noon
```

## 环境变量

建议在项目根目录创建 `.env.local`，不要提交这个文件。

```bash
DATABASE_URL=./data/industry-radar.sqlite
REPORT_OUTPUT_DIR=./data/reports
PUBLIC_DATA_DIR=./data/public
PUBLISH_DIR=/volume1/web/industry-radar/public-data
BARK_NOTIFY_URL=
BARK_KEY=
NAS_RUN_TYPE=noon
NAS_RUN_DATE=
NAS_MOCK_FALLBACK=false
NAS_LOG_DIR=./logs/nas-daily
```

- `DATABASE_URL`：SQLite 文件位置，可以放到 NAS 持久化目录。
- `REPORT_OUTPUT_DIR`：HTML/Markdown 报告输出目录。
- `PUBLIC_DATA_DIR`：`pnpm export:site` 生成线上静态 JSON 的目录。
- `PUBLISH_DIR`：线上网页读取的发布目录；为空时只生成不发布。
- `BARK_NOTIFY_URL` / `BARK_KEY`：留给 TASK-04 的 Bark 模块使用，当前脚本只检测并预留调用点，不直接发送密钥。
- `NAS_RUN_TYPE`：默认运行类型，支持 `morning`、`noon`、`night`。
- `NAS_RUN_DATE`：可选，指定报告日期，格式 `YYYY-MM-DD`；为空时使用当天。
- `NAS_MOCK_FALLBACK`：是否在真实采集没有结果时启用 mock 兜底。正式在线页面建议保持 `false`，避免示例数据误推。
- `NAS_LOG_DIR`：每日运行日志目录。

## 运行阶段

脚本会按阶段写日志：

1. `generate report`：调用 `pnpm report:run -- --type noon|night --date YYYY-MM-DD`。
2. `export static data`：调用 `pnpm export:site`，由 TASK-01 提供静态 JSON 导出。
3. `publish static data`：如果设置了 `PUBLISH_DIR`，把 `PUBLIC_DATA_DIR` 的文件复制到发布目录。
4. `collect stats`：从当日报告 Markdown 或导出的 `overview.json` 读取新增条数和高分条数。
5. Bark 通知：如果后续实现了 `notify:bark` 脚本，会把状态、消息和日志路径交给它；当前不会直接发送 Bark 请求。

`morning` 目前映射到现有 `noon` 报告窗口。后续如果 CLI 新增独立 morning 类型，只需要调整脚本里的映射。

## 定时任务示例

NAS crontab 示例：

```cron
0 8 * * * cd /volume1/docker/industry-radar && /bin/bash scripts/nas-daily-update.sh morning >> logs/nas-cron.log 2>&1
0 12 * * * cd /volume1/docker/industry-radar && /bin/bash scripts/nas-daily-update.sh noon >> logs/nas-cron.log 2>&1
0 22 * * * cd /volume1/docker/industry-radar && /bin/bash scripts/nas-daily-update.sh night >> logs/nas-cron.log 2>&1
```

如果使用 Docker Compose，可以把命令替换成：

```cron
0 12 * * * cd /volume1/docker/industry-radar && docker compose run --rm radar bash scripts/nas-daily-update.sh noon >> logs/nas-cron.log 2>&1
```

## 失败处理

- 任意阶段失败都会记录当前阶段、退出码和日志文件。
- 发布阶段不会删除已有线上数据；导出失败时不会覆盖发布目录。
- `export:site` 尚未实现时，脚本会明确提示需要 TASK-01 提供静态 JSON 导出，然后退出非 0。
- Bark 模块尚未实现时，脚本只记录“已配置但未实现”，不会泄露 Key，也不会阻塞本地报告和数据。

## 手动验证

```bash
bash -n scripts/nas-daily-update.sh
shellcheck scripts/nas-daily-update.sh
pnpm nas:daily -- noon
```

当前仓库如果尚未包含 `export:site`，最后一条命令会在 `export static data` 阶段停止。这是预期的集成等待状态，不会删除已有线上数据。
