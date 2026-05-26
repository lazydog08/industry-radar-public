# 行业情报雷达 + 个人知识库

这是一个长期运行的行业情报与个人知识库系统，聚焦数码、自媒体/平台生态、汽车行业。它会采集合规公开来源，去重聚合为行业事件，沉淀到 SQLite，并生成 HTML/Markdown 每日报告。

## 技术栈

- Node.js 24+ / TypeScript
- SQLite FTS5（使用 Node 内置 `node:sqlite`）
- Express Web UI
- 公开数据源适配器：IT之家 RSS、B站热门/排行/搜索、Apple Newsroom、Android Blog、知乎热榜、微博热搜、mock
- HTML + Markdown 报告
- 可选 Webhook 推送

## 安装

```bash
pnpm install
cp .env.example .env
pnpm kb:init
```

当前机器如果没有 `pnpm`，可先运行：

```bash
npm install -g pnpm@10.12.1
```

## 手动运行

```bash
pnpm report:morning
pnpm report:noon
pnpm report:night
pnpm report:run -- --type morning
pnpm report:run -- --type noon
pnpm report:run -- --type night
pnpm sources:test
```

使用 mock 数据跑通完整链路：

```bash
pnpm report:run -- --type morning --mock
pnpm report:run -- --type noon --mock
pnpm report:run -- --type night --mock
```

使用隔离演示库跑通完整链路，不污染默认数据库：

```bash
scripts/demo-local.sh
scripts/demo-local.sh --serve
```

模拟一周 10 次运行：

```bash
scripts/simulate-week.sh 2026-05-19 5 data/simulations/week-2026-05-19_to_2026-05-23
```

真实采集没有结果时使用 mock 兜底验证：

```bash
pnpm report:run -- --type noon --mock-fallback
```

导出线上只读网页需要的静态数据：

```bash
pnpm export:site
```

默认会生成 `public-data/overview.json`、`events.json`、`knowledge.json`、`reports/index.json`、`meta.json`，这些文件是 NAS 发布到网页目录的主要产物，不应提交进 Git。

## 自动更新

正式线上更新推荐使用 NAS cron 调用：

```bash
pnpm nas:daily -- morning
pnpm nas:daily -- noon
pnpm nas:daily -- night
```

该流程会执行“抓取公开数据 -> 入库和评分 -> 生成报告 -> 导出线上 JSON -> 发布到网页目录 -> 通知模块”。详见 `docs/NAS_DAILY_UPDATE.md`。

## NAS 部署最短闭环

QNAP 用户详见 `docs/QNAP_SETUP.md`，绿联用户详见 `docs/UGREEN_SETUP.md`。

NAS 上推荐只负责采集、入库、评分、生成报告和更新静态数据；线上网页只读取 `public-data`，不直连 SQLite，也不提供写入能力。

1. 从本地 Gitea 拉取或升级仓库：

```bash
REPO_URL=http://192.168.31.50:3000/lazydog/industry-radar-kb.git \
APP_DIR=/volume1/docker/industry-radar \
bash scripts/nas-bootstrap.sh
```

2. 创建 NAS 本地配置，不提交进 Git：

```bash
cp .env.example .env.local
```

至少确认这些变量：

```bash
DATABASE_URL=./data/industry-radar.sqlite
REPORT_OUTPUT_DIR=./data/reports
PUBLIC_DATA_DIR=./public-data
PUBLISH_DIR=/path/to/static-site/public-data
BARK_KEY=your_bark_key
BARK_PUBLIC_URL=https://example.com/industry-radar/
```

3. 手动跑一次完整链路：

```bash
pnpm nas:daily -- noon
```

4. 跑 NAS 健康检查：

```bash
pnpm nas:health
```

5. 确认网页目录能访问 `public-data/overview.json` 和 `public-data/events.json` 后，再配置 NAS 定时任务：

```bash
pnpm nas:schedule -- print-cron
pnpm nas:schedule -- install
```

QNAP 用户改用 `bash scripts/qnap-install-cron.sh`（或 `pnpm nas:qnap-install`）才能让 cron 在重启后保留。

NAS 安装、定时、验收、静态发布和告警排障分别见 `docs/NAS_INSTALL.md`、`docs/NAS_SCHEDULE.md`、`docs/NAS_ACCEPTANCE.md`、`docs/NAS_WEB_PUBLISH.md`、`docs/NAS_OBSERVABILITY.md`。Bark 配置详见 `docs/BARK_SETUP.md`，静态导出和只读网页细节详见 `docs/STATIC_EXPORT.md`、`docs/STATIC_WEB_MODE.md`。

不要提交 `.env.local`、SQLite 数据库、`logs/`、`public-data/`、`data/runtime/` 或任何 Bark Key / Cookie / Token。

## 6. GitHub Pages 公网托管

把静态前端发布到 `https://lazydog08.github.io/industry-radar-public/`，无需服务器，手机和电脑均可访问。在 NAS 的 `.env.local` 中设置 `ENABLE_GITHUB_PAGES_PUSH=true`，日更成功后会自动把 `public-data/` 推送到 GitHub 并触发重新部署。详见 [`docs/GITHUB_PAGES.md`](docs/GITHUB_PAGES.md)。

`ENABLE_INTERNAL_SCHEDULER=true` 适合本地或容器常驻演示：服务进程会在北京时间 12:00 运行中午报告、22:00 运行晚间报告，并在报告成功后自动执行静态导出。静态导出失败只会写入错误日志，不会让调度器退出。生产环境仍优先使用 NAS cron，因为它更容易查看日志、重跑和接入 Bark 通知。

## 搜索知识库

```bash
pnpm kb:search -- "OPPO 影像"
pnpm kb:search -- "小米汽车 智驾"
pnpm kb:search -- "B站 流量 规则"
pnpm kb:search -- "AI 手机 发布会"
```

## Web UI

```bash
pnpm serve
```

打开：

```text
http://localhost:3877
```

本地默认端口是 `3877`。当前这台机器上如果还能访问 `http://localhost:3887/`，那是本机 `launchctl` 托管的演示服务，不是新部署时应默认使用的端口。

## 数据位置

- SQLite：`data/industry-radar.sqlite`
- 报告：`data/reports/YYYY-MM-DD-morning.html`、`data/reports/YYYY-MM-DD-noon.html`、`data/reports/YYYY-MM-DD-night.html`
- mock 数据：`data/sample/mock-source-items.json`
- 账号/关键词配置：`config/accounts.json`

## 报告结构

HTML/Markdown 报告按“个人情报中心”组织，不输出原始新闻流水账：

- 顶部展示日期、报告类型、时间窗口、数据源状态、新增事件数、重要事件数。
- 主体包含 3 分钟必看 Top 5、今日主线判断、数码、自媒体/平台生态、汽车、品牌/高管/博主动态、持续发酵/有更新、可拍视频选题、数据源异常与限制。
- 同一事件会按标题相似度、品牌/平台实体、关键标签和时间窗口自动合并；晚间报告只展示中午后新增，中午出现后又新增来源的事件会进入“持续发酵/有更新”。
- 单个数据源失败不会中断报告，异常会写入报告末尾和 `run_logs`。

## Web UI 功能

- 首页是情报中心：最近 7 天重要事件、搜索、分类/来源/标签/实体筛选、知识卡、报告归档、话题时间线。
- 支持收藏、持续跟踪、不感兴趣、已用于视频，这些标记保存在 `user_feedback`。
- 报告归档可直接打开每天中午/晚上的 HTML 报告。

## 推送

默认总是生成本地 HTML + Markdown，并在控制台输出路径。

如果设置了 `REPORT_WEBHOOK_URL`，系统会把 Markdown 摘要 POST 到该 Webhook。Webhook 失败不会影响本地报告、数据库写入和报告归档。

## 合规边界

- 只访问公开页面、公开接口、RSS、搜索页、热榜页。
- 不登录、不绕验证码、不偷 Cookie、不保存账号密码。
- 单源失败不会导致整份报告失败。
- 知乎/微博公开访问受限时，会在报告里标注异常。

## 后续扩展

- 增加少数派、36氪、懂车帝、汽车之家、小红书、抖音、YouTube、X、更多品牌官网。
- 接入飞书、企业微信、Telegram、邮件。
- 接入 embedding provider 做语义搜索。
- 扩展周报/月报趋势复盘。
