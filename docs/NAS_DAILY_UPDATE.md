# NAS 每日自动更新

本流程用于在 NAS 上无人值守执行：

```text
抓取公开数据 -> 入库和评分 -> 生成报告 -> 导出线上 JSON -> 发布到网页目录 -> Bark 推送
```

脚本入口：

```bash
scripts/nas-daily-update.sh [morning|noon|night]
```

也可以通过 npm script 调用：

```bash
pnpm nas:daily -- morning
pnpm nas:daily -- noon
pnpm nas:daily -- night
```

## 最短部署闭环

1. 在 NAS 上从本地 Gitea 拉取仓库：

```bash
git clone http://192.168.31.50:3000/lazydog/industry-radar-kb.git
cd industry-radar-kb
pnpm install
```

2. 创建 `.env.local`，填入 NAS 本机路径和 Bark 配置。这个文件只留在 NAS 上，不提交 Git。

3. 先手动跑一次：

```bash
pnpm nas:daily -- noon
```

4. 确认 `PUBLIC_DATA_DIR` 生成 `overview.json`、`events.json`、`knowledge.json`、`reports/index.json`、`meta.json`，并确认 `PUBLISH_DIR` 下能被网页访问。

5. 配置 cron 或 NAS 任务计划，每天定点运行 `morning`、`noon`、`night`。线上网页是只读静态页面，NAS 每次更新并发布 `public-data` 后，手机和桌面浏览器刷新即可看到新数据。

6. 使用 `BARK_DRY_RUN=true pnpm notify:bark` 验证通知文案，再打开真实 Bark 推送。详见 [BARK_SETUP.md](BARK_SETUP.md)。

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
- `BARK_NOTIFY_URL` / `BARK_KEY`：Bark 通知配置；脚本只从环境变量读取，不写入 Git，也不会把 Key、日志路径、数据库路径放进推送正文。
- `NAS_RUN_TYPE`：默认运行类型，支持 `morning`、`noon`、`night`。
- `NAS_RUN_DATE`：可选，指定报告日期，格式 `YYYY-MM-DD`；为空时使用当天。
- `NAS_MOCK_FALLBACK`：是否在真实采集没有结果时启用 mock 兜底。正式在线页面建议保持 `false`，避免示例数据误推。
- `NAS_LOG_DIR`：每日运行日志目录。

## 运行阶段

脚本会按阶段写日志：

1. `generate report`：调用 `pnpm report:run -- --type morning|noon|night --date YYYY-MM-DD`。
2. `export static data`：调用 `pnpm export:site`，由 TASK-01 提供静态 JSON 导出。
3. `publish static data`：如果设置了 `PUBLISH_DIR`，先把 `PUBLIC_DATA_DIR` 完整复制到同父目录的候选目录，再切换发布目录。
4. `collect stats`：从当日报告 Markdown 或导出的 `overview.json` 读取新增条数和高分条数。
5. Bark 通知：调用 `pnpm notify:bark`，发送状态、日期/类型、新增条数、高分条数和网页地址；Bark 网络失败不会回滚已经生成的网页数据。

报告文件名按运行类型独立生成：

- `morning`：`YYYY-MM-DD-morning.html/md`，窗口为当天 `00:00-09:59`。
- `noon`：`YYYY-MM-DD-noon.html/md`，保留原窗口 `10:00-12:00`。
- `night`：`YYYY-MM-DD-night.html/md`，保留原窗口 `12:00-22:00`。

这样同一天早报和午报不会互相覆盖，`collect stats` 也会优先读取对应运行类型的 Markdown。

## 发布目录切换策略

设置 `PUBLISH_DIR` 后，脚本不会把 JSON 逐个覆盖进线上目录，而是采用候选目录切换：

1. 检查 `PUBLIC_DATA_DIR` 必须存在；不存在时直接失败，不删除旧线上数据。
2. 在 `PUBLISH_DIR` 同父目录创建 `${PUBLISH_DIR}.next-时间戳`。
3. 把本次导出的 `overview.json`、`events.json`、`knowledge.json`、`reports/` 等完整复制到 `.next-*` 目录。
4. 如果当前 `PUBLISH_DIR` 存在，先移动为 `${PUBLISH_DIR}.previous`，再把 `.next-*` 移动为新的 `PUBLISH_DIR`。
5. 如果当前 `PUBLISH_DIR` 不存在，直接把 `.next-*` 移动为 `PUBLISH_DIR`。

这样网页端不会读到 `overview.json` 已更新、`events.json` 仍是旧版本的混合状态。每次成功切换后，上一个版本会保留在 `${PUBLISH_DIR}.previous`，方便手动回滚。

如果 NAS 文件系统或挂载方式不允许整体移动 `PUBLISH_DIR`，脚本会降级为 `rsync --delete`。这个 fallback 能保持目录内容一致，但不是严格原子，HTTP 服务在同步瞬间仍可能读到更新中的文件。真实线上目录建议优先选择允许同父目录 `mv` 的普通目录。

## 内部调度器边界

`ENABLE_INTERNAL_SCHEDULER=true` 会让 `pnpm serve` 常驻进程在北京时间 12:00 执行 `noon` 报告、22:00 执行 `night` 报告。报告成功后，内部调度器会继续调用 `export:site` 的同一套导出逻辑，刷新 `PUBLIC_DATA_DIR` / `EXPORT_SITE_DIR` / 默认 `public-data` 里的静态 JSON。

内部调度器适合本地演示或容器常驻兜底，不是推荐的 NAS 正式方案。正式线上更新仍建议使用 NAS cron 调用 `scripts/nas-daily-update.sh`，原因是 cron 更容易查看单次日志、手动重跑、发布到指定网页目录，并接入 Bark 成功/失败通知。

如果内部调度器的静态导出失败，服务只会记录 `内部调度静态导出失败`，不会退出，也不会影响下一次定时检查。报告生成失败时不会继续导出，避免用未更新的数据覆盖线上静态文件。

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
- 发布阶段会先构建 `${PUBLISH_DIR}.next-时间戳`，构建失败或 `PUBLIC_DATA_DIR` 不存在时不会删除已有线上数据。
- 目录切换失败后会尝试恢复旧 `PUBLISH_DIR`；只有在整体切换不可用时才使用 `rsync --delete` fallback，并会在日志中明确标注“not strictly atomic”。
- 脚本只会删除 `PUBLISH_DIR` 同父目录下的 `${PUBLISH_DIR}.next-*` 和 `${PUBLISH_DIR}.previous`，不会删除父目录外的文件。
- `export:site` 失败时，脚本会在 `export static data` 阶段退出非 0，并保留日志供排查。
- Bark 模块未配置时会安全跳过；配置后由 `notify:bark` 负责发送成功或失败通知，不会泄露 Key；Bark 网络失败不会阻塞本地报告、静态数据和发布目录。

## Git 与发布边界

- `.env.local`、SQLite 数据库、`logs/`、`public-data/`、`data/runtime/`、运行报告缓存和 Bark Key 不提交。
- 代码和文档通过本地 Gitea 同步；线上网页数据由 NAS 定时生成并发布，不从 Git 仓库读取运行数据库。
- `public-data` 是网页读取目录，不是源码目录。线上只读页面的行为见 [STATIC_WEB_MODE.md](STATIC_WEB_MODE.md)，静态 JSON 的结构见 [STATIC_EXPORT.md](STATIC_EXPORT.md)。

## 手动验证

```bash
bash -n scripts/nas-daily-update.sh
shellcheck scripts/nas-daily-update.sh
pnpm report:run -- --type morning --mock-fallback
pnpm nas:daily -- morning
pnpm nas:daily -- noon
```

最后一条命令会完整跑一遍报告、静态导出和可选发布流程。真实上线前，建议先把 `DATABASE_URL`、`REPORT_OUTPUT_DIR`、`PUBLIC_DATA_DIR`、`PUBLISH_DIR` 指向 NAS 的持久化目录，再用 `NAS_MOCK_FALLBACK=false` 做一次手动验证。
