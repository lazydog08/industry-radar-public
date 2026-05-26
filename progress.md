# 行业情报收集系统进度

- 最后更新时间：2026-05-26 14:15:05 CST
- 当前阶段：项目源码已同步到本地 NAS Gitea 私有仓库 `lazydog/industry-radar-kb`

## 项目总目标

构建一个长期运行的行业情报雷达和个人知识库系统。系统应能采集合规公开来源，归一化、去重、评分并沉淀到 SQLite，生成 HTML/Markdown 报告，并通过 Web UI 完成搜索、筛选、知识卡查看、反馈标记和报告归档浏览。

## 当前理解的需求

- 能在缺少 API Key、登录态、真实数据或第三方服务不稳定时继续运行。
- 至少要有一条本地 Mock 主流程：初始化数据库、生成中午/晚间报告、写入知识库、搜索、Web UI 查看。
- Web UI 要能直接演示核心价值：概览、事件列表、知识卡、反馈、报告归档、时间线。
- 数据和密钥要留在本地，公开采集失败不能影响报告生成。
- 结构要清晰，后续能继续扩展更多公开来源、部署方式和趋势复盘。
- 事件详情、报告和命令行输出里的来源要能直接看到并打开原始地址。
- 个人知识库要能提示“哪些内容优先补来源”和“哪些内容适合回收成视频选题”。

## 任务清单

- [x] 已完成：读取根目录、README、依赖文件、源码目录、配置、文档、脚本和数据库迁移。
- [x] 已完成：确认项目为 Node.js 24+ / TypeScript / SQLite / Express 架构。
- [x] 已完成：创建并维护无人值守进度、假设、错误和决策日志。
- [x] 已完成：修复 Web UI 静态资源缺失导致的可演示问题。
- [x] 已完成：运行 typecheck/build，修复编译错误。
- [x] 已完成：用 Mock 数据验证报告生成、数据库写入、搜索和报告归档。
- [x] 已完成：启动 Web UI，用浏览器检查首页、搜索、知识卡、反馈和报告链接。
- [x] 已完成：补齐 README 或脚本中与基础演示相关的缺口。
- [x] 已完成：更新本文件，记录最终验证命令、修改文件和遗留问题。
- [x] 已完成：按全局规则完成 Claude CLI 只读审查，并修复审查指出的主要前端问题。
- [!] 阻塞但已降级：知乎、微博公开源受登录/风控限制，真实源检查不阻塞本地演示主流程。
- [x] 已完成：实现新版 Radar Score，区分 Radar Score、视频潜力、置信度、新鲜度、封顶规则和首页分区。
- [x] 已完成：扩写知识卡模板，增加发生了什么、为什么重要、创作影响、推荐理由和评分拆解。
- [x] 已完成：重排 Web UI，新增“一图读懂”、分区摘要、今日必看/正在发酵/适合做视频/背景知识信息流。
- [x] 已完成：让报告模板、CLI 搜索和 API 都使用 Radar Score 口径。
- [x] 已完成：按全局规则让 Claude Code 审查评分/数据库核心改动，并修复 P1/P2 中影响正确性的发现。
- [x] 已完成：在一图读懂、知识卡详情、HTML/Markdown 报告和 CLI 搜索中展示可点击或可复制的来源 URL。
- [x] 已完成：新增知识库体检 API 和前端面板，显示低置信、单来源、封顶/示例、优先补来源和可回收选题。
- [x] 已完成：按 Claude Review 修复来源链接安全、本地服务绑定、报告路径、API 参数校验、周报/月报命令和 CLI 连接关闭。
- [!] 阻塞但已降级：最终一次目标 Claude 复审长时间无响应，已终止并记录；此前有效 Claude 审查发现已处理，主流程验证通过。
- [x] 已完成：用今天上午窗口真实公开源跑采集测试，并刷新 Web UI 展示实际运行结果。
- [x] 已完成：按浏览器批注简化一图读懂底部来源展示，保留可点击链接但隐藏长标题和长 URL。
- [x] 已完成：按浏览器批注优化评分系统展示，用颜色、等级含义和分数替代裸露的 `B58`。
- [x] 已完成：初始化 Git 提交，创建本地 NAS Gitea 私有仓库并推送 `main` 分支。

## 最近完成内容

- 已读取 `README.md`、`package.json`、`tsconfig.json`、`Dockerfile`、`docker-compose.yml`、`migrations/001_init.sql`、`docs/INDUSTRY_RADAR.md`、`docs/DEPLOYMENT_DECISION.md`、主要 `src` 文件和脚本。
- 已发现 `src/web/index.html` 引用 `/app.js`，但 `src/web` 当前只有 `index.html` 和 `styles.css`，会导致 Web UI 交互脚本缺失。
- 已确认当前目录没有 `.git`，无法通过 git 状态追踪改动。
- 已新增 `src/web/app.js`，实现概览、筛选搜索、事件详情、反馈标记、报告归档和话题时间线。
- 已重写 `src/web/styles.css`，匹配当前 `index.html` 的类名和工作台布局。
- 已验证 `node --check src/web/app.js`、`pnpm typecheck`、`pnpm build` 均通过。
- 已修改 `src/server.ts`，优先返回浏览器可直接执行的 `src/web/app.js`。
- 已新增 `scripts/demo-local.sh`，可在 `data/runtime/demo.sqlite` 和 `data/runtime/reports` 下生成隔离演示数据；`--serve` 可直接启动 Web UI。
- 已更新 `README.md`，补充隔离演示库使用方式。
- 已用 `scripts/demo-local.sh` 验证中午报告、晚间报告、周报、月报均能生成。
- 已用浏览器验证 `http://localhost:3887`：首页指标、事件列表、知识卡、搜索、收藏反馈、收藏筛选、话题时间线按钮、报告 HTML 链接均可用。
- 已重新用带环境变量的直接启动命令运行服务，确认当前 Web UI 读取的是 `data/runtime/demo.sqlite` 和 `data/runtime/reports`。
- 已改用 macOS `launchctl` 托管 `3887` 演示服务，避免普通后台进程被会话回收。
- 已保存验证截图：`data/runtime/screenshots/dashboard.png`、`data/runtime/screenshots/weekly-report.png`。
- 已按全局规则初始化本地 Git 元数据，新增 Claude 只读审查闭环：`AGENTS.md`、`CLAUDE.md`、`scripts/review.sh`。
- 已运行 Claude CLI 审查，结果写入 `.reviews/latest.md` 和 `.reviews/archive/20260526T032057Z.md`。
- 已修复 Claude 提出的主要问题：URL 协议白名单、防详情请求乱序、反馈刷新降级、清理 `app.ts` 双入口、datalist 清理、DOM 缺失显式报错。
- 2026-05-26 12:21 CST 重新复验：`3887` 服务仍在运行，`/api/overview` 返回 5 条事件和 8 份报告摘要；`node --check`、`pnpm typecheck`、`pnpm build`、脚本语法检查均通过。
- 2026-05-26 12:21 CST 重新运行 `scripts/demo-local.sh`：中午报告、晚间报告、周报、月报均重新生成成功。
- 2026-05-26 12:21 CST 重新验证浏览器页面：`http://localhost:3887/` 显示“情报中心”，有 5 条事件、报告链接、反馈按钮；搜索“OPPO 影像”后收敛到 1 条 OPPO 事件。
- 2026-05-26 12:21 CST 重新验证 `kb:search`：`OPPO 影像` 命中 OPPO 影像旗舰事件。
- 2026-05-26 12:21 CST 运行 `pnpm sources:test`：IT之家、B站、官方源可返回数据；知乎 401、微博 403/风控，按降级策略记录，不影响 Mock 演示主流程。
- 2026-05-26 12:59 CST 新增 `src/scoring/radar.ts`：按用户相关度、趋势增速/扩散质量、新鲜度、变化强度、来源可信度、稀缺性生成 Radar Score，并派生视频潜力、置信度、分区和推荐理由。
- 2026-05-26 12:59 CST 修改 `src/store/db.ts`：事件水合时附加 Radar 字段；修复迁移事务、最近事件时间边界、无效日期匹配、FTS 重建事务、FTS 查询转义、旧事件内容被低质量更新覆盖等 Claude Review 发现的问题。
- 2026-05-26 12:59 CST 修改 `src/kb/knowledge.ts`：知识卡文案扩写，强调时间、来源、行业影响、创作者影响和后续验证。
- 2026-05-26 12:59 CST 修改 `src/web/index.html`、`src/web/app.js`、`src/web/styles.css`：重排首屏，新增“一图读懂”、分区摘要、分区信息流和详情评分卡。
- 2026-05-26 12:59 CST 修改 `src/report/templates.ts` 和 `src/cli.ts`：报告与命令行搜索输出同步 Radar Score、视频潜力和置信度。
- 2026-05-26 12:59 CST 补充 Mock/示例数据识别：即使来源名保留为 `bilibili/ithome/zhihu/weibo`，只要 URL 带 mock/sample/example 痕迹，也会触发示例数据封顶和 UI 标注。
- 2026-05-26 13:35 CST 修改 `src/web/app.js`、`src/web/styles.css`：在一图读懂和知识卡详情中展示来源卡片；新增知识库体检面板，显示单来源、优先补来源和可回收选题。
- 2026-05-26 13:35 CST 修改 `src/store/db.ts`、`src/types.ts`、`src/server.ts`：新增 `knowledgeHealth`、真实队列计数、来源标题空值处理、API 参数校验、数据库连接 `try/finally` 收口。
- 2026-05-26 13:35 CST 修改 `src/report/templates.ts`、`src/cli.ts`、`src/config.ts`：报告来源链接改为安全可点击 URL；CLI 来源格式更清晰；服务默认仅监听 `127.0.0.1`；周报/月报命令等待生成完成。
- 2026-05-26 13:35 CST 已让 Claude Code 审查来源追溯和知识库体检；已修复其指出的 P0/P1/P2 问题。最终一次更小范围复审无响应，已终止并记录到 `.reviews/latest.md`。
- 2026-05-26 13:56 CST 运行真实公开源测试：`ithome` 45 条、`bilibili` 47 条、`official` 40 条可用；`zhihu` 401、`weibo` 403/风控，按降级规则记录。
- 2026-05-26 13:56 CST 使用 `DATABASE_URL=./data/runtime/demo.sqlite REPORT_OUTPUT_DIR=./data/runtime/reports pnpm report:run -- --type noon --date 2026-05-26 --mock-fallback` 生成真实中午报告，新增 23 条事件。
- 2026-05-26 13:56 CST 刷新应用内浏览器 `http://localhost:3887/`，页面显示真实采集事件：特斯拉超充卡、华为 FreeClip 2、MicroLED 光互连、仰望 U7 OTA、传音 Infinix Hot 70 等；来源卡片可点开原始地址。
- 2026-05-26 13:58 CST 修改 `src/web/app.js`、`src/web/styles.css`：一图读懂底部来源改为 `来源 · 域名` 紧凑标签；知识卡详情仍保留完整标题和 URL。
- 2026-05-26 14:03 CST 修改 `src/web/app.js`、`src/web/styles.css`：新增评分图例；事件卡片改为彩色 `A 重点 / B 观察 / C 背景 / D 暂存` 胶囊；一图读懂和知识卡同步显示等级含义。
- 2026-05-26 14:15 CST 补充 `.gitignore`，排除 `.reviews`、运行数据库、报告、验证产物、日志、构建产物和发布产物；创建初始提交 `12efa70` 并推送到 `http://192.168.31.50:3000/lazydog/industry-radar-kb`。

## 下一步动作

1. 后续可继续加强真实公开源质量，减少示例数据在演示中的占比。
2. 后续可把 Web API 和前端核心交互补成自动化回归测试。
3. 后续可优化数据库水合和搜索候选集，减少 Claude Review 提到的 N+1 查询性能风险。
4. 后续可把“优先补来源”接成真实源二次检索，把 Mock/示例项替换为当日真实来源后再提升评分上限。
5. 后续可进一步打磨“一图读懂”的视觉层级和真实来源状态。

## 最终验证记录

- `node --check src/web/app.js`：通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `DATABASE_URL=./data/runtime/demo.sqlite REPORT_OUTPUT_DIR=./data/runtime/reports pnpm kb:init`：通过。
- `DATABASE_URL=./data/runtime/demo.sqlite REPORT_OUTPUT_DIR=./data/runtime/reports pnpm report:run -- --type noon --date 2026-05-26 --mock`：通过，生成 4 条新增事件。
- `DATABASE_URL=./data/runtime/demo.sqlite REPORT_OUTPUT_DIR=./data/runtime/reports pnpm report:run -- --type night --date 2026-05-26 --mock`：通过，生成 2 条新增事件、3 条持续更新。
- `DATABASE_URL=./data/runtime/demo.sqlite REPORT_OUTPUT_DIR=./data/runtime/reports pnpm kb:search -- "OPPO 影像"`：通过，命中 OPPO 影像事件。
- `DATABASE_URL=./data/runtime/demo.sqlite REPORT_OUTPUT_DIR=./data/runtime/reports pnpm kb:search -- "B站 流量 规则"`：通过，命中 B站平台规则事件。
- `scripts/demo-local.sh`：通过，生成隔离演示数据库和 4 份报告。
- `launchctl submit -l com.codex.industry-radar-demo ... PORT=3887 /opt/homebrew/bin/pnpm serve`：已启动，Web UI 地址为 `http://localhost:3887`。
- Claude review：完成；大 diff 审查曾超时，缩小到核心前端入口后返回结果；已修复 P1/P2/P3 中可直接处理的问题。
- Claude 修复后验证：`node --check src/web/app.js`、`pnpm typecheck`、`pnpm build` 均通过；浏览器刷新后首页仍正常显示 5 条事件和 8 份报告。
- 2026-05-26 12:21 CST 复验：`lsof -nP -iTCP:3887 -sTCP:LISTEN` 显示 `node` 仍在监听。
- 2026-05-26 12:21 CST 复验：`curl http://localhost:3887/api/overview` 返回 5 条事件、8 份报告摘要。
- 2026-05-26 12:21 CST 复验：`node --check src/web/app.js`、`pnpm typecheck`、`pnpm build`、`bash -n scripts/demo-local.sh scripts/review.sh` 均通过。
- 2026-05-26 12:21 CST 复验：`./scripts/demo-local.sh` 完整通过，重新生成中午、晚间、周、月报告。
- 2026-05-26 12:21 CST 复验：浏览器打开 `http://localhost:3887/` 成功，搜索“OPPO 影像”成功返回 1 条事件。
- 2026-05-26 12:21 CST 复验：`DATABASE_URL=./data/runtime/demo.sqlite REPORT_OUTPUT_DIR=./data/runtime/reports pnpm kb:search -- "OPPO 影像"` 命中 OPPO 影像事件。
- 2026-05-26 12:21 CST 真实源检查：`pnpm sources:test` 完成；`ithome` 45 条、`bilibili` 100 条、`official` 40 条可用；`zhihu`/`weibo` 因公开访问权限或风控降级。
- 2026-05-26 12:59 CST 验证：`node --check src/web/app.js` 通过。
- 2026-05-26 12:59 CST 验证：`pnpm typecheck` 通过。
- 2026-05-26 12:59 CST 验证：`pnpm build` 通过。
- 2026-05-26 12:59 CST 验证：`./scripts/demo-local.sh` 通过，重新生成中午、晚间、周、月报告。
- 2026-05-26 12:59 CST 验证：`curl http://localhost:3887/api/overview` 返回 Radar 字段；Mock/示例 URL 触发封顶，首条 OPPO 事件为 `C 45`，`caps` 包含 `Mock/示例数据封顶`。
- 2026-05-26 12:59 CST 验证：Chrome 打开 `http://localhost:3887/`，一图读懂、分区信息流、知识卡评分和 Mock 封顶标注均显示，无加载错误。
- 2026-05-26 12:59 CST 验证：`DATABASE_URL=./data/runtime/demo.sqlite REPORT_OUTPUT_DIR=./data/runtime/reports pnpm kb:search -- "B站 流量 规则"` 返回 Radar、视频潜力、置信度和推荐理由。
- 2026-05-26 13:35 CST 验证：`node --check src/web/app.js` 通过。
- 2026-05-26 13:35 CST 验证：`pnpm typecheck` 通过。
- 2026-05-26 13:35 CST 验证：`pnpm build` 通过。
- 2026-05-26 13:35 CST 验证：`./scripts/demo-local.sh` 通过，中午、晚间、周报、月报均重新生成成功。
- 2026-05-26 13:35 CST 验证：`lsof -nP -iTCP:3887 -sTCP:LISTEN` 显示服务监听 `127.0.0.1:3887`。
- 2026-05-26 13:35 CST 验证：`curl http://localhost:3887/api/overview` 返回 `knowledgeHealth.metrics`、`queueCounts` 和事件来源 URL。
- 2026-05-26 13:35 CST 验证：`curl http://localhost:3887/reports/2026-05-26-weekly.html` 返回 200。
- 2026-05-26 13:35 CST 验证：生成报告中未发现 `javascript:` 链接或重复裸 URL。
- 2026-05-26 13:35 CST 验证：应用内浏览器刷新 `http://localhost:3887/` 后无错误；一图读懂和知识卡详情各显示 2 个来源卡片，来源链接可点击；知识库体检显示“单来源”和队列说明。
- 2026-05-26 13:56 CST 验证：`pnpm sources:test -- --type noon` 完成，3/5 公开源可用，知乎/微博降级。
- 2026-05-26 13:56 CST 验证：真实中午报告生成成功，`2026-05-26-noon.html/md` 写入 `data/runtime/reports`，新增事件 23 条。
- 2026-05-26 13:56 CST 验证：`curl http://localhost:3887/api/overview` 返回最近 25 条事件、2 条重要事件、21 条适合做视频、首条真实来源为 `https://www.ithome.com/0/955/162.htm`。
- 2026-05-26 13:56 CST 验证：应用内浏览器刷新后无错误，首屏已展示真实采集内容和可点击来源链接。
- 2026-05-26 13:58 CST 验证：`node --check src/web/app.js`、`pnpm typecheck` 通过；应用内浏览器中 `.compact-source-list .source-card` 为 0，`.source-chip` 正常显示并保留 href。
- 2026-05-26 14:03 CST 验证：`node --check src/web/app.js`、`pnpm typecheck` 通过；应用内浏览器中裸 `B58` 已替换为 `B 观察 58`，评分图例和一图读懂彩色角标正常显示。
- 2026-05-26 14:15 CST 验证：`git ls-remote origin main` 返回远端 `main` 指向 `12efa70`；本地 `main` 已跟踪 `origin/main`。
