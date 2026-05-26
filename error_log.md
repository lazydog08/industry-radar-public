# Error Log

## Error 001
- 时间：2026-05-26 03:40:38 CST
- 现象：`git status --short` 返回 `fatal: not a git repository (or any of the parent directories): .git`。
- 影响：无法使用 git 状态追踪本次修改。
- 处理：记录到 `assumptions.md` 和 `progress.md`，后续用文件清单和验证结果交付。
- 状态：[!] 阻塞但已降级

## Error 002
- 时间：2026-05-26 03:40:38 CST
- 现象：`src/web/index.html` 引用 `<script type="module" src="/app.js"></script>`，但 `src/web` 没有 `app.ts` 或 `app.js`。
- 影响：Web UI 打开后无法加载事件、搜索、知识卡和反馈交互。
- 处理：已新增 `src/web/app.js`，并重写 `src/web/styles.css` 匹配当前页面结构。
- 状态：[x] 已完成

## Error 003
- 时间：2026-05-26 03:48:00 CST
- 现象：浏览器打开首页后指标仍为 0；`/app.js` 实际返回 `src/web/app.ts` 的旧脚本，而不是新补的 `src/web/app.js`。
- 影响：Web UI 仍无法加载新交互逻辑。
- 处理：修改 `src/server.ts`，优先返回 `app.js`，仅在没有 `app.js` 时回退到 `app.ts`。
- 状态：[x] 已完成

## Error 004
- 时间：2026-05-26 03:48:00 CST
- 现象：`/api/overview` 返回 `ReferenceError: areHydratedEventsSimilar is not defined`。
- 影响：Web UI 不能读取概览和事件列表。
- 处理：当前源码已有 `areHydratedEventsSimilar`，重启服务后 `/api/overview` 正常返回演示事件和报告归档。
- 状态：[x] 已完成

## Error 005
- 时间：2026-05-26 03:47:00 CST
- 现象：浏览器中时间线输入框按回车可用，但“查看”按钮点击没有触发。
- 影响：鼠标操作路径不完整。
- 处理：取消右侧知识卡 sticky 定位，避免滚动后覆盖时间线按钮。
- 状态：[x] 已完成

## Error 006
- 时间：2026-05-26 03:49:00 CST
- 现象：`3877` 端口再次被默认数据库服务占用。
- 影响：继续使用 `3877` 会让演示页面读到默认数据库，不是隔离演示库。
- 处理：停止占用 `3877` 的服务，改用 `3887` 启动隔离演示服务，并验证环境变量为 `DATABASE_URL=./data/runtime/demo.sqlite`、`REPORT_OUTPUT_DIR=./data/runtime/reports`。
- 状态：[x] 已完成

## Error 007
- 时间：2026-05-26 11:18:00 CST
- 现象：首次 Claude review 传入范围过大，CLI 超过 90 秒没有写出结果。
- 影响：不能把这次卡住误判为代码缺陷。
- 处理：停止卡住的 Claude 进程，先用极小 prompt 验证 Claude CLI 可用，再缩小到核心前端入口 `src/web/app.js` 完成审查；同时给 `scripts/review.sh` 增加默认 diff 行数上限和超时降级记录。
- 状态：[x] 已完成

## Error 008
- 时间：2026-05-26 12:21:19 CST
- 现象：`pnpm sources:test` 中 `ithome`、`bilibili`、`official` 可返回数据；`zhihu` 返回 HTTP 401，`weibo` 返回 HTTP 403 或访客/风控页面。
- 影响：真实公开源不能保证全量稳定，尤其是需要登录态、Cookie 或验证码的页面。
- 处理：不使用登录、Cookie 或验证码绕过；按项目规则保留 Mock/降级流程，保证本地演示、报告生成、知识库和 Web UI 不被外部源阻塞。
- 状态：[!] 阻塞但已降级

## Error 009
- 时间：2026-05-26 12:59:20 CST
- 现象：Claude Code 审查完整前端+后端 diff 超过 180 秒未返回。
- 影响：不能把完整 diff 审查超时误判为代码缺陷。
- 处理：缩小到评分和数据库核心改动后重新审查，Claude 返回 P1/P2/P3 发现；已修复影响正确性的迁移事务、时间边界、旧内容覆盖、无效日期匹配、FTS 重建和 FTS 查询转义问题。
- 状态：[x] 已完成

## Error 010
- 时间：2026-05-26 12:59:20 CST
- 现象：Mock 演示数据来源名保留为 `bilibili/ithome/zhihu/weibo`，初版 Radar Score 未触发 Mock 封顶。
- 影响：演示信息可能被误认为真实当天高分情报。
- 处理：Radar 评分补充 URL 级 mock/sample/example 识别，只要来源链接带示例痕迹就封顶并在 UI 中显示 `Mock/示例数据封顶`。
- 状态：[x] 已完成

## Error 011
- 时间：2026-05-26 13:35:02 CST
- 现象：Claude Review 指出知识库“优先补来源”队列条件过宽，前端队列计数显示截断后的数量。
- 影响：体检面板可能把普通单来源内容都显示成优先补证据，降低决策价值。
- 处理：后端改为“封顶/示例”或“低置信 + 单来源”才进入优先补来源；新增 `queueCounts` 返回真实队列数量；前端显示“单来源”指标和队列说明。
- 状态：[x] 已完成

## Error 012
- 时间：2026-05-26 13:35:02 CST
- 现象：Claude Review 指出报告 HTML 来源链接需要 URL 协议白名单，服务端 API/报告路径/CLI 连接关闭存在稳定性问题。
- 影响：恶意 URL、异常请求或命令异常可能影响安全性和长期运行稳定性。
- 处理：报告链接只允许 `http/https`；服务默认监听 `127.0.0.1`；报告路径使用绝对路径和错误处理中间件；CLI 搜索使用 `try/finally` 关闭数据库；搜索日期/分类和配置数字增加校验。
- 状态：[x] 已完成

## Error 013
- 时间：2026-05-26 13:35:02 CST
- 现象：最终一次小范围 Claude Code 复审长时间无响应，手动终止后 `.reviews/latest.md` 一度为空。
- 影响：不能把这次复审作为有效代码审查结果，也不能让空审查文件误导后续接手。
- 处理：终止卡住的 Claude 进程；将 `.reviews/latest.md` 更新为复审超时记录；保留此前有效 Claude 审查归档并按其发现完成修复。
- 状态：[!] 阻塞但已降级
