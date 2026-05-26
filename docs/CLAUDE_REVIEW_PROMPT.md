# Claude Review Prompt

请以资深工程师 code review 的方式审查下面这个本地项目变更。优先指出会导致功能不可用、数据污染、安全/隐私风险、可维护性问题和缺少验证的地方。请按严重程度排序，给出具体文件/位置、风险说明和建议修复方式。

## 项目背景

项目路径：`/Users/lazydog/Documents/行业情报收集系统`

项目目标：行业情报雷达 + 个人知识库。系统采集合规公开来源，归一化、去重、评分并写入 SQLite，生成 HTML/Markdown 报告，并通过 Express Web UI 提供搜索、筛选、知识卡、反馈标记、报告归档和话题时间线。

技术栈：

- Node.js 24+ / TypeScript
- SQLite FTS5 via `node:sqlite`
- Express Web UI
- 原生 HTML/CSS/JS 前端
- `pnpm` 脚本运行

## 本轮改动目标

用户要求无人值守完成一个基础可运行、可演示、主流程能跑通的版本。由于真实平台数据、登录态、API Key 都可能不可用，本轮优先保证 Mock 数据主流程和本地 Web UI 可演示。

## 关键改动

1. 新增 `src/web/app.js`
   - 实现首页概览、事件列表、事件详情、筛选搜索、反馈标记、报告归档、话题时间线。
   - 直接通过 `/api/overview`、`/api/search`、`/api/events/:id`、`/api/events/:id/feedback`、`/api/timeline`、`/api/reports` 访问后端。

2. 重写 `src/web/styles.css`
   - 匹配 `src/web/index.html` 的当前类名。
   - 使用两栏工作台布局。
   - 取消 `.knowledge` sticky 定位，避免右栏覆盖时间线按钮。

3. 修改 `src/server.ts`
   - `/app.js` 路由从优先返回 `src/web/app.ts` 改为优先返回浏览器可直接执行的 `src/web/app.js`。

4. 新增 `scripts/demo-local.sh`
   - 使用隔离演示库 `data/runtime/demo.sqlite` 和 `data/runtime/reports`。
   - 自动运行 `kb:init`、中午 Mock 报告、晚间 Mock 报告、周报、月报。
   - 支持 `--serve` 启动 Web UI。

5. 更新 `README.md`
   - 增加隔离演示库的运行方法。

6. 新增运行记录文件
   - `progress.md`
   - `assumptions.md`
   - `decision_log.md`
   - `error_log.md`

## 已验证

- `node --check src/web/app.js`
- `pnpm typecheck`
- `pnpm build`
- `DATABASE_URL=./data/runtime/demo.sqlite REPORT_OUTPUT_DIR=./data/runtime/reports pnpm kb:init`
- `DATABASE_URL=./data/runtime/demo.sqlite REPORT_OUTPUT_DIR=./data/runtime/reports pnpm report:run -- --type noon --date 2026-05-26 --mock`
- `DATABASE_URL=./data/runtime/demo.sqlite REPORT_OUTPUT_DIR=./data/runtime/reports pnpm report:run -- --type night --date 2026-05-26 --mock`
- `DATABASE_URL=./data/runtime/demo.sqlite REPORT_OUTPUT_DIR=./data/runtime/reports pnpm kb:search -- "OPPO 影像"`
- `DATABASE_URL=./data/runtime/demo.sqlite REPORT_OUTPUT_DIR=./data/runtime/reports pnpm kb:search -- "B站 流量 规则"`
- `scripts/demo-local.sh`
- 浏览器验证 `http://localhost:3887/`
  - 首页指标
  - 事件列表
  - 知识卡
  - 搜索
  - 收藏反馈
  - 收藏筛选
  - 话题时间线按钮
  - 报告 HTML 链接

## 已知问题 / 想重点请你看

1. `src/web/app.ts` 和 `src/web/app.js` 目前并存。
   - 服务端优先返回 `app.js`，但长期看可能导致维护混乱。

2. Express 路由里每次请求都手动 new/close `Store`。
   - 请评估错误路径下是否有连接泄漏风险。

3. `scripts/demo-local.sh --serve` 默认端口是 `3877`。
   - 实际演示时我曾改用 `3887`，因为 `3877` 可能被其他服务占用。

4. 前端是无构建原生 JS。
   - 请评估当前错误处理、XSS 防护、可维护性和浏览器兼容性。

5. 反馈接口是无鉴权本地接口。
   - 请评估如果未来绑定到公网或 NAS，需要补哪些安全边界。

6. Mock 验证会写入演示数据库和报告目录。
   - 请评估是否还有污染默认数据的路径。

## 需要重点审查的文件

- `src/server.ts`
- `src/web/index.html`
- `src/web/app.js`
- `src/web/styles.css`
- `scripts/demo-local.sh`
- `README.md`
- `progress.md`
- `assumptions.md`
- `decision_log.md`
- `error_log.md`

## Review 输出格式

请按下面格式输出：

1. Findings
   - 按 P0/P1/P2/P3 排序。
   - 每条包含：文件/位置、问题、影响、建议修复。

2. Open Questions
   - 只列真正需要确认的问题。

3. Positive Notes
   - 简短列出已经做对的地方。

4. Suggested Next Patch
   - 给出最优先的 3-5 个补丁建议。
