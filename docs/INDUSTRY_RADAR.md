# 系统设计说明

## 目标

每天用很短时间掌握数码、自媒体、汽车行业的关键变化，并把重要信息沉淀为可搜索、可复盘、可做选题的个人知识库。

系统不是保存全文的新闻爬虫，而是保存公开元数据、短摘要、来源链接和自己的知识卡。

## 数据流

1. source adapter 访问公开来源。
2. 每条原始信息统一成 `SourceItem`。
3. 标题归一化和相似度判断做去重。
4. 多来源合并为一个 `events` 行。
5. 自动识别分类、标签、实体和重要性评分。
6. 生成知识卡字段。
7. 写入 SQLite 和 FTS5。
8. 生成 HTML/Markdown 报告。
9. Web UI 支持搜索、筛选、反馈和时间线。

## 数据源适配器

当前结构：

- `src/sources/bilibili.ts`
- `src/sources/ithome.ts`
- `src/sources/zhihu.ts`
- `src/sources/weibo.ts`
- `src/sources/mock.ts`

每个 adapter 返回统一结构：

```ts
{
  id,
  source,
  title,
  url,
  publishedAt,
  fetchedAt,
  author,
  category,
  tags,
  summaryRaw,
  heatScore,
  engagement,
  raw
}
```

单源失败只影响该源状态，不影响其他源和报告生成。

## 数据库

SQLite 文件默认：

```text
data/industry-radar.sqlite
```

核心表：

- `source_items`：原始来源条目。
- `events`：聚合后的行业事件和知识卡。
- `event_sources`：事件对应多个来源链接。
- `entities` / `event_entities`：品牌、人物、平台、产品、技术。
- `tags` / `event_tags`：分类标签。
- `reports` / `report_events`：报告归档和报告事件关系。
- `user_feedback`：收藏、持续跟踪、不感兴趣、已用于视频等反馈。
- `run_logs`：采集和报告生成日志。
- `search_history`：搜索历史。
- `event_fts`：SQLite FTS5 全文索引。

## 去重与聚合

- `source + url + title` 生成来源 hash。
- 标题 normalize：去空格、标点、前缀噪音和常见后缀。
- canonical title 完全相同直接合并。
- 标题 bigram 相似度大于阈值时合并。
- 同一事件多平台报道只生成一个 event，来源写入 `event_sources`。
- 晚间报告读取当天中午报告事件，已出现事件放入“持续发酵/有更新”。

## 评分

`importance_score` 参考：

- 来源权重。
- 热度数据。
- 多来源数量。
- 高价值关键词：发布会、系统更新、召回、涨价、降价、爆料、开售、事故、智驾、AI、芯片、财报、规则调整。
- 实体数量。
- 标签数量。
- 是否有争议、选题机会和持续追踪价值。

## 搜索

命令行：

```bash
pnpm kb:search -- "OPPO 影像"
pnpm kb:search -- "小米汽车 智驾"
pnpm kb:search -- "B站 流量 规则"
pnpm kb:search -- "AI 手机 发布会"
```

Web UI：

```bash
pnpm serve
```

## 语义搜索预留

当前不强依赖任何大模型或向量数据库。

数据库里预留：

- `events.embedding_provider`
- `events.embedding_json`

后续可以新增 `src/kb/vector.ts`，检测 `EMBEDDING_PROVIDER` 或 `OPENAI_API_KEY` 后生成 embedding。没有 API Key 时，SQLite FTS5 仍然可用。

## 周报/月报预留

已有命令：

```bash
pnpm report:weekly
pnpm report:monthly
```

MVP 阶段基于最近 7/30 天数据库事件生成基础报告。后续可扩展：

- 本周/本月最重要事件。
- 品牌动作时间线。
- 平台规则变化。
- 视频选题复盘。
- 收藏、跟进、已用于视频事件复盘。
