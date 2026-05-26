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

## Error 014
- 时间：2026-05-26 15:34:19 CST
- 现象：TASK-09 第一次用 `tsx -e` 验证调度器单次任务时，执行器不支持顶层 await；第二次在 eval 中按 `.js` 后缀导入源码也无法解析。
- 影响：只影响临时验证命令，不影响调度器功能。
- 处理：改用已构建的 `dist/config.js` 和 `dist/scheduler.js` 执行单次验证，成功生成报告并导出静态 JSON。
- 状态：[x] 已完成

## Error 015
- 时间：2026-05-26 15:39:25 CST
- 现象：TASK-08 应用内浏览器控制通道没有可用活动页面；第一次改用 Chrome DevTools 验证时连接到浏览器级 WebSocket，`Page.enable` 不可用。
- 影响：只影响临时 DOM 验证方式，不影响静态搜索实现。
- 处理：改用页面级 DevTools WebSocket 重新验证，隔离静态目录中 `overview.events=1`、`events.json=33` 时，搜索 overview 之外事件成功命中。
- 状态：[x] 已完成

## Error 016
- 时间：2026-05-26 16:06:52 CST
- 现象：提交推送后的 Bark 完成通知第一次 shell 参数拼接失败，第二次 Python HTTPS 请求握手超时。
- 影响：只影响人工完成通知，不影响已推送的代码、NAS 自动化或页面运行。
- 处理：改用 `curl -4 --max-time 20` 重试，Bark 完成通知发送成功；后续 NAS 正式流程使用 `scripts/notify-bark.ts`，已通过 dry-run 和协议校验。
- 状态：[x] 已完成

## Error 017
- 时间：2026-05-26 16:49:43 CST
- 现象：NAS 专项完整 diff 版 Claude Code 审查两次超时；首次脚本级审查返回 P1 风险，最终复审又因输入截断无法确认部分文件。
- 影响：如果直接信任超时或截断结果，会漏掉 NAS 运维脚本里的真实问题。
- 处理：改用完整脚本内容做 focused Claude review；修复 REPO_URL 凭据日志脱敏、Bark dry-run 清空继承的 `BARK_NOTIFY_URL`、健康检查隔离 build、端口校验、cron 日志保留和日更日志清理；最终 Claude 复审确认剩余 cron 日志 P1 已解决。
- 状态：[x] 已完成

## Error 018
- 时间：2026-05-26 17:00:30 CST
- 现象：用户要求使用 `superpowers` 插件，但当前环境没有该插件，工具搜索和可安装插件列表都没有返回 `superpowers`。
- 影响：不能按字面使用该插件执行项目收尾。
- 处理：记录为插件不可用降级；继续使用现有 Codex 工具、终端、Claude Code review、Gitea、NAS 脚本和 Bark 完成最终验收。
- 状态：[!] 阻塞但已降级

## Error 019
- 时间：2026-05-26 17:00:30 CST
- 现象：NAS `192.168.31.50` 的 SSH 端口开放，但 `lazydog@192.168.31.50` 免密登录失败，返回 `Permission denied (publickey,password)`。
- 影响：本机不能直接进入 NAS Shell 安装 cron 或写 Web 目录。
- 处理：不继续猜测账号密码；以本地等价 NAS 流程完成日更、发布和健康检查，并把代码推送到 NAS Gitea。真实 NAS 安装由 NAS 本机运行已提交脚本完成。
- 状态：[!] 阻塞但已降级

## Error 020
- 时间：2026-05-26 17:00:30 CST
- 现象：一次 `kb:search` 在日更刷新后短暂返回 `database is locked`。
- 影响：并发服务和命令行同时访问演示 SQLite 时，偶发读写锁可能影响单次搜索。
- 处理：等待后重试成功，且数据库已启用 WAL 和 `busy_timeout`；本次不阻塞最终交付，后续若频繁出现再增加 CLI 重试或拆分只读连接。
- 状态：[!] 阻塞但已降级
