# 静态数据导出

`export:site` 把本地 SQLite 里的事件、知识卡、报告索引和来源链接导出成线上网页可直接读取的 JSON。线上页面读取这些 JSON 即可展示，不需要连接 Express API，也不会拿到本机数据库文件、日志、运行缓存或环境变量。

## 快速使用

默认导出到 `public-data/`：

```bash
pnpm export:site
```

指定目录：

```bash
EXPORT_SITE_DIR=/path/to/public-data pnpm export:site
pnpm export:site -- --out /path/to/public-data
```

如果 NAS 使用演示库或指定库：

```bash
DATABASE_URL=./data/runtime/demo.sqlite REPORT_OUTPUT_DIR=./data/runtime/reports pnpm export:site
```

## 输出结构

```text
public-data/
  overview.json
  events.json
  knowledge.json
  meta.json
  reports/
    index.json
    *.html
    *.md
```

- `overview.json`：首页所需数据，包含指标、最近事件、分区、今日分区、报告摘要、筛选项和知识库体检。
- `events.json`：最近事件完整列表，包含评分、标签、实体、来源链接和推荐理由。
- `knowledge.json`：知识卡列表，以及“优先补来源 / 适合回收成视频 / 需要跟进”等队列。
- `reports/index.json`：报告归档索引，只保留报告文件名和相对 URL，不暴露本机绝对路径。
- `meta.json`：导出时间、数据量、空库状态和导出说明。

默认会把数据库中已登记、且位于 `REPORT_OUTPUT_DIR` 内的报告 HTML/Markdown 复制到 `public-data/reports/`，方便线上页面直接打开报告。若只想导出 JSON：

```bash
EXPORT_COPY_REPORTS=false pnpm export:site
```

## 可配置环境变量

- `EXPORT_SITE_DIR` / `PUBLIC_DATA_DIR` / `STATIC_EXPORT_DIR`：导出目录，默认 `public-data/`。
- `EXPORT_RECENT_DAYS`：`overview.json` 和 `events.json` 的最近事件窗口，默认 7 天。
- `EXPORT_EVENT_LIMIT`：事件导出上限，默认 300 条。
- `EXPORT_KNOWLEDGE_DAYS`：知识卡导出窗口，默认 90 天。
- `EXPORT_KNOWLEDGE_LIMIT`：知识卡导出上限，默认 300 条。
- `EXPORT_REPORT_LIMIT`：报告索引导出上限，默认 120 份。
- `EXPORT_COPY_REPORTS`：设为 `false` 时不复制报告文件。

## NAS 集成建议

NAS 每天执行顺序建议如下：

```bash
pnpm report:run -- --type noon --mock-fallback
pnpm export:site
```

之后把 `public-data/` 同步到线上网页目录。线上网页只需要读取 JSON 和报告静态文件，不需要访问 SQLite。

## 安全边界

- 不导出 `.env`、Token、Cookie、数据库文件、日志、抓取原始 `raw_json`、搜索历史和运行记录。
- 来源 URL 只保留 `http` / `https`，无效或危险协议会被过滤。
- `meta.json` 只记录数据库文件名和报告目录名，不记录本机绝对路径。
- 如果数据库不存在或为空，脚本仍会输出完整空结构，线上页面应按 `meta.empty` 展示空状态。
