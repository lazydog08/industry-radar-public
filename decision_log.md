# Decision Log

## Decision 001
- 时间：2026-05-26 03:40:38 CST
- 决策：MVP 先稳定本地 Mock 主流程和 Web UI，不等待真实平台数据。
- 原因：真实公开页面和接口可能受网络、风控、时间窗口影响；项目已有 Mock 数据和兜底模式，适合无人值守演示。
- 影响：验证会同时覆盖 `--mock` 和必要时 `--mock-fallback`，真实源失败只记录不阻塞。

## Decision 002
- 时间：2026-05-26 03:40:38 CST
- 决策：先修复源码层 Web UI，而不是依赖 `dist` 里的历史构建产物。
- 原因：`pnpm serve` 使用 `tsx src/server.ts`，运行时读取 `src/web`；当前 `src/web/app.ts/js` 缺失会直接影响交互。
- 影响：会新增源码前端脚本，并根据验证结果调整服务端静态资源处理。

## Decision 003
- 时间：2026-05-26 03:40:38 CST
- 决策：不在项目外写入配置或密钥。
- 原因：无人值守边界要求不泄露也不保存密钥；当前基础版本不需要第三方 API Key。
- 影响：`.env` 如不存在不会强制创建，默认配置足够跑本地演示。

## Decision 004
- 时间：2026-05-26 03:45:00 CST
- 决策：验证和浏览器演示使用 `data/runtime/demo.sqlite` 与 `data/runtime/reports`。
- 原因：避免把 Mock 示例数据混入已有 `data/industry-radar.sqlite` 和 `data/reports`。
- 影响：演示服务启动时需要带上 `DATABASE_URL` 和 `REPORT_OUTPUT_DIR` 环境变量；默认生产数据不被这轮验证污染。

## Decision 005
- 时间：2026-05-26 12:21:19 CST
- 决策：当前不触发“开新的”，继续保留本线程和 `3887` 演示服务。
- 原因：基础可运行/可演示主流程已经复验通过；未完全稳定的是知乎、微博等外部公开源访问，这属于预期的可降级外部限制，不是本地主流程未跑通。
- 影响：后续迭代优先增强真实源质量和自动化回归；当前可直接演示本地端到端流程。

## Decision 006
- 时间：2026-05-26 12:59:20 CST
- 决策：新版首页排序以派生 `Radar Score` 为准，保留旧 `importance_score` 作为兼容字段。
- 原因：旧库不适合做破坏性迁移；事件水合时派生 Radar 字段，可以让旧数据、搜索、报告和 Web UI 同时工作。
- 影响：新增和更新事件会写入新版分数；旧事件通过 API 会获得实时派生的 Radar Score。

## Decision 007
- 时间：2026-05-26 12:59:20 CST
- 决策：Mock/示例数据只要来源链接带 `mock/sample/example` 痕迹就封顶到 45 分。
- 原因：演示数据保留了真实来源名，单看 `source` 无法识别是 Mock，容易误导用户以为是当天真实情报。
- 影响：本地演示会更诚实地显示“适合做视频/背景”而不是“今日必看”；真实源需要后续接入后才能获得更高评分。

## Decision 008
- 时间：2026-05-26 12:59:20 CST
- 决策：先修 Claude Review 指出的正确性问题，性能类 N+1 查询作为后续优化。
- 原因：事务、时间边界、旧内容覆盖和 FTS 一致性会影响结果正确性；N+1 查询当前在本地 demo 数据量下不阻塞主流程。
- 影响：后续数据量增加前，应继续优化搜索和事件匹配的批量水合。

## Decision 009
- 时间：2026-05-26 13:35:02 CST
- 决策：来源展示以“完整可点 URL + 安全协议白名单”为准，报告和 Web UI 均只允许 `http/https` 跳转。
- 原因：用户需要直接查看原文件；Claude Review 指出 HTML 报告不能信任采集到的 URL 协议。
- 影响：合法来源在一图读懂、知识卡详情、HTML/Markdown 报告和 CLI 中都可追溯；异常协议降级为不可执行链接。

## Decision 010
- 时间：2026-05-26 13:35:02 CST
- 决策：知识库体检优先展示“低置信 + 单来源”或“封顶/示例”的补证据队列，并单独展示“可回收选题”队列。
- 原因：单纯列出所有单来源会制造噪音；对视频创作者更有用的是知道哪些内容需要补来源、哪些内容可以进入选题池。
- 影响：后续应把补证据队列接入真实源二次检索，把“已用于视频/忽略”等反馈继续纳入排序。

## Decision 011
- 时间：2026-05-26 13:35:02 CST
- 决策：演示服务默认只监听 `127.0.0.1`，不暴露到局域网。
- 原因：当前 API 没有鉴权，包含本地知识库和反馈状态；本地优先项目不应默认被同网设备访问。
- 影响：浏览器使用 `http://localhost:3887/` 不受影响；如果未来需要局域网演示，需要显式设置 `HOST`。

## Decision 012
- 时间：2026-05-26 14:45:00 CST
- 决策：NAS 日更脚本只预留 Bark 调用点，不直接实现 Bark HTTP 发送。
- 原因：TASK-03 的负责范围明确把 Bark 细节留给 TASK-04；脚本只需要传递状态、消息和日志路径，避免在本任务中处理密钥和通知格式。
- 影响：设置 `BARK_NOTIFY_URL` 或 `BARK_KEY` 后，当前脚本会记录“已配置但通知模块未实现”；待 TASK-04 增加 `notify:bark` 后即可接入。
- 当前状态：已过期。2026-05-26 TASK-04 已新增 `pnpm notify:bark`，NAS 日更脚本会调用该脚本发送成功/失败通知，通知正文不会包含日志路径或数据库路径。

## Decision 013
- 时间：2026-05-26 14:25:00 CST
- 决策：TASK-02 前端启动时优先读取 `public-data/overview.json`，读取成功后进入线上只读模式；读取失败则回退原有 `/api/overview`。
- 原因：线上网页应由 NAS 导出的静态数据驱动，不依赖 Express/SQLite；同时不能破坏当前 `localhost:3887` 本地演示。
- 影响：静态模式下详情、搜索、筛选和时间线在浏览器本地完成，反馈按钮禁用且不调用写接口；本地服务可选暴露 `PUBLIC_DATA_DIR` / `EXPORT_SITE_DIR` 或 `public-data` 目录便于预览。

## Decision 014
- 时间：2026-05-26 14:27:20 CST
- 决策：TASK-01 静态导出以 `public-data/` 为默认产物目录，核心 JSON 保持稳定文件名：`overview.json`、`events.json`、`knowledge.json`、`reports/index.json`、`meta.json`。
- 原因：NAS 日更、线上只读页面和后续发布脚本需要固定入口；稳定文件名比按日期分散 JSON 更适合集成。
- 影响：线上前端可以固定读取 `public-data/overview.json`；如果未来要做历史快照，可在此基础上额外增加日期目录，而不是替换这些入口文件。

## Decision 015
- 时间：2026-05-26 14:41:29 CST
- 决策：`public-data/` 作为 NAS/导出生成物加入 `.gitignore`，代码仓库只提交导出器、静态读取逻辑、脚本和文档。
- 原因：`public-data/` 会包含每日报告、情报 JSON 和运行期快照，应该由 NAS 定时生成并发布，不应作为源码版本的一部分。
- 影响：本地预览仍可通过 `pnpm export:site` 生成 `public-data/`；上线时由 `PUBLISH_DIR` 或静态托管目录接收生成物。

## Decision 016
- 时间：2026-05-26 15:32:51 CST
- 决策：内部调度器采用方案 A，报告成功后调用 `exportStaticSiteData(config)` 刷新静态 JSON。
- 原因：前端线上只读模式依赖静态 JSON；如果 `ENABLE_INTERNAL_SCHEDULER` 只生成报告，会造成网页数据滞后。
- 影响：内部调度器也能更新 `PUBLIC_DATA_DIR` / `EXPORT_SITE_DIR` / 默认 `public-data`；静态导出失败只记录错误，不让服务退出。正式线上更新仍推荐 NAS cron，便于日志、重跑、发布和 Bark 通知。

## Decision 017
- 时间：2026-05-26 15:34:06 CST
- 决策：Bark 推送正文只发送状态、日期/类型、新增条数、高分条数和网页地址，不发送日志路径、数据库路径、发布目录或原始 `BARK_MESSAGE`。
- 原因：`nas-daily-update.sh` 的失败消息可能包含本机日志路径；推送到 iPhone 的内容应该可读且不泄露本地目录结构。
- 影响：失败通知会提示更新失败，但详细排障仍回到 NAS 本地日志；集成时可继续从脚本日志查看 `BARK_LOG_FILE`，但不会通过 Bark 发出。

## Decision 018
- 时间：2026-05-26 15:34:03 CST
- 决策：将 `morning` 独立为日报类型，文件名使用 `YYYY-MM-DD-morning.html/md`，窗口使用当天 `00:00-09:59:59`。
- 原因：Claude 流程 review 指出早报映射到午报会覆盖同一天 `YYYY-MM-DD-noon` 产物；独立类型能让 NAS 早报、午报、晚报三次运行各自保留。
- 影响：`pnpm report:run -- --type morning`、`pnpm report:morning` 和 `scripts/nas-daily-update.sh morning` 会生成独立早报；原有 noon/night 命令、窗口和文件名不变。

## Decision 019
- 时间：2026-05-26 15:39:25 CST
- 决策：静态模式搜索、筛选、时间线和预览外详情统一懒加载 `events.json`，并缓存到 `state.staticAllEvents`。
- 原因：`overview.json` 只截取前 80 条会让线上只读搜索存在盲区；懒加载能兼顾首屏速度和完整搜索覆盖。
- 影响：`overview.json` 新增 `eventTotal`、`eventPreviewCount` 和 `links.events` 作为发布约定；若 `events.json` 加载失败，前端显示轻量降级提示并回退到 `overview.events`。

## Decision 020
- 时间：2026-05-26 15:45:24 CST
- 决策：NAS 发布静态数据时优先采用 `${PUBLISH_DIR}.next-${STAMP}` 候选目录加 `${PUBLISH_DIR}.previous` 备份的目录切换策略。
- 原因：逐个复制 JSON 会让 HTTP 服务可能读到新 `overview.json` 和旧 `events.json` 的混合状态；先构建完整候选目录再切换可以避免线上读到半成品。
- 影响：成功发布后上一个版本保留在 `${PUBLISH_DIR}.previous`；如果 NAS 文件系统不允许整体移动发布目录，脚本降级为 `rsync --delete`，但文档明确该 fallback 不是严格原子。

## Decision 021
- 时间：2026-05-26 15:45:20 CST
- 决策：TASK-11 前端 UX 采用原生 `details/summary` 折叠高级筛选，并在分区和报告归档内使用本地“显示全部/收起”状态。
- 原因：手机端首屏应以阅读和搜索为主，不应被完整筛选表单占用；分区和报告默认截断可以保持页面轻，但必须给用户继续展开的路径。
- 影响：默认界面只展示关键词输入和搜索按钮；静态模式 `events.json` 懒加载逻辑不变，分区展开只影响当前首页预览事件；报告归档仍默认 8 份但可展开全部。

## Decision 022
- 时间：2026-05-26 15:44:09 CST
- 决策：文档统一以 `3877` 作为本地默认端口，`3887` 只描述为当前开发机 launchctl 演示服务；NAS 正式更新以 `pnpm nas:daily -- morning|noon|night` 为主闭环。
- 原因：新部署用户应按默认 `pnpm serve` 端口访问；当前 `3887` 是为了不中断本机演示单独托管的服务。NAS 定时任务比内部调度器更适合发布静态目录、查看日志和发送 Bark。
- 影响：README 和静态网页文档会避免把新用户引到 `3887`；部署说明统一为“Gitea 拉取 -> `.env.local` -> `pnpm nas:daily -- noon` -> 发布 `public-data` -> Bark 通知”。

## Decision 023
- 时间：2026-05-26 16:08:59 CST
- 决策：NAS 专项继续采用多 agent 并行拆分，但每个 agent 只负责互不重叠的文件范围：安装升级、定时任务、静态发布、健康验收、Bark/日志闭环。
- 原因：NAS 端上线需要多个脚本和文档同时补齐；拆成独立文件能减少冲突，主 agent 负责最终集成、验收和 Claude Code 复审。
- 影响：本轮不会把真实 Bark Key、NAS 账号、Cookie 或私有路径写入仓库；所有真实 NAS 参数继续通过 `.env.local` 或用户现场配置注入。

## Decision 024
- 时间：2026-05-26 16:49:43 CST
- 决策：NAS 健康检查默认使用隔离目录并在成功后清理；真实路径写入必须同时设置 `HEALTHCHECK_USE_REAL_PATHS=true` 和 `HEALTHCHECK_ALLOW_REAL_WRITES=true`。
- 原因：健康检查会跑 mock 报告和静态导出，默认不应污染生产 SQLite 或长期堆积运行产物。
- 影响：常规验收使用 `pnpm nas:health` 即可；需要排查时可用 `HEALTHCHECK_KEEP_RUN_DIR=true` 保留隔离目录，真实路径验收必须显式确认。

## Decision 025
- 时间：2026-05-26 16:49:43 CST
- 决策：NAS cron 任务同时清理 cron 包装日志和 `nas-daily-update.sh` 自身生成的日更日志，默认保留 14 天。
- 原因：只清理 cron 包装日志仍会让 `YYYY-MM-DD-type-STAMP.log` 在 NAS 上无限增长。
- 影响：`CRON_LOG_RETENTION_DAYS` 可调整保留天数；清理范围限制在 `NAS_LOG_DIR` 下匹配本项目命名的日志文件。
