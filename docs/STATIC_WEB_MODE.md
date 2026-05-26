# 线上只读网页模式

## 目标

线上网页只负责展示 NAS 已经生成好的数据，不直接连接 SQLite，也不依赖 Express API。NAS 定时任务负责抓取、入库、评分、生成报告并导出静态 JSON。

## 前端读取顺序

`src/web/app.js` 启动后会按下面顺序加载数据：

1. 优先读取 `/public-data/overview.json`。
2. 如果网页部署在子路径下，再尝试 `./public-data/overview.json`。
3. 如果静态 JSON 不存在或格式不可用，自动回退到当前本地接口 `/api/overview`。

静态 JSON 成功加载后，页面进入只读模式：

- 事件详情直接从静态数据中读取，不调用 `/api/events/:id`。
- 搜索、筛选和时间线在浏览器本地完成。
- 收藏、跟踪、不感兴趣、已用于视频按钮会禁用，不调用写接口。
- 报告归档和来源链接仍然保留可点击地址。

## 推荐 JSON 入口

推荐由 TASK-01 或 NAS 导出任务生成：

```text
public-data/overview.json
```

最低可用结构：

```json
{
  "meta": {
    "updated_at": "2026-05-26T12:00:00+08:00"
  },
  "metrics": {
    "recentEvents": 25,
    "mustRead": 3,
    "developing": 5,
    "videoReady": 12,
    "background": 5,
    "reports": 8,
    "highConfidence": 10
  },
  "events": [],
  "reports": [],
  "facets": {
    "sources": [],
    "tags": [],
    "entities": [],
    "categories": []
  },
  "knowledgeHealth": {
    "metrics": {},
    "queueCounts": {},
    "queues": {}
  }
}
```

如果 `metrics`、`facets` 或 `knowledgeHealth` 缺失，前端会根据 `events` 做基础兜底计算。

## 事件字段要求

为了完整保留当前体验，`events` 里的每条事件建议包含：

- `id`
- `title`
- `summary`
- `push_reason`
- `what_happened`
- `why_it_matters`
- `creator_impact`
- `content_angle`
- `cover_angle`
- `category`
- `radar_score`
- `radar_level`
- `radar_section`
- `video_potential`
- `confidence`
- `freshness_label`
- `score_parts`
- `tags`
- `entities`
- `sources`
- `first_seen_at`
- `last_seen_at`
- `feedback`
- `caps`

如果列表事件和详情事件未来分开导出，`overview.json` 也可以额外包含：

```json
{
  "eventDetails": {
    "event-id": {}
  }
}
```

前端会优先使用 `eventDetails` 里的完整详情。

## 本地预览

本地 Express 服务现在会可选暴露 `PUBLIC_DATA_DIR` / `EXPORT_SITE_DIR` 指向的目录；未设置时读取项目根目录下的 `public-data`：

```text
http://localhost:3887/public-data/overview.json
```

如果该文件不存在，本地页面会自动回退到 `/api/overview`，不影响当前演示。

## 给集成负责人的约定

- TASK-01 导出的 `overview.json` 应尽量包含完整事件详情，避免线上详情页字段不足。
- 在线静态部署时，确保 `index.html`、`app.js`、`styles.css` 和 `public-data/overview.json` 在同一个站点根路径下。
- NAS 更新数据时只需要替换 `public-data/overview.json` 和报告文件；前端无需重新构建。
- Bark 推送里的线上地址应指向静态网页入口，而不是本地 Express API。
