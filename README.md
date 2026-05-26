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
pnpm report:noon
pnpm report:night
pnpm report:run -- --type noon
pnpm report:run -- --type night
pnpm sources:test
```

使用 mock 数据跑通完整链路：

```bash
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

## 数据位置

- SQLite：`data/industry-radar.sqlite`
- 报告：`data/reports/YYYY-MM-DD-noon.html`、`data/reports/YYYY-MM-DD-night.html`
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
