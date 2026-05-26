# 运行方案评估

本系统的目标是长期沉淀行业情报与个人知识库，不只是临时生成一份新闻摘要。因此核心运行环境必须满足：稳定联网、可持久化 SQLite 数据库、可备份、可查看 HTML/Web UI、可安全保存环境变量。

## 1. Codex Automations 长期运行方案

适合做：

- 定期代码维护、异常复盘、关键词和数据源策略优化。
- 每周或每月读取数据库后生成趋势复盘。
- 检查采集失败日志，提出修复建议。
- 辅助生成更好的报告模板、搜索视图和知识卡结构。

不适合做：

- 作为唯一长期在线主机。
- 作为唯一持久数据库所在环境。
- 依赖其本地目录和运行额度进行每天两次的核心采集。
- 保存唯一副本的数据资产。

主要风险：

- 依赖 Codex app 是否运行、项目目录是否存在、网络是否稳定。
- 长期运行会受使用额度、会话状态、本地环境变动影响。
- 如果把数据库只放在 Codex 运行目录，备份和恢复边界不清晰。

结论：

Codex 适合作为“开发、维护、复盘、异常分析”的智能协作者，不建议作为唯一长期运行主机。它可以做辅助自动化，例如每天检查失败原因、每周优化关键词、每周生成趋势复盘。

## 2. NAS 运行方案

如果 NAS 支持 Docker / Container Manager / Container Station，NAS 很适合作为主运行环境：

- 用 Docker Compose 固定 Node 运行环境。
- 用挂载卷保存 `data/industry-radar.sqlite` 和 `data/reports`。
- 用 NAS 计划任务或容器内外部 cron 在每天 12:00 和 22:00 执行报告命令。

示例：

```bash
docker compose run --rm radar pnpm report:noon
docker compose run --rm radar pnpm report:night
```

也可以使用 NAS 计划任务：

```cron
0 12 * * * cd /volume1/docker/industry-radar && docker compose run --rm radar pnpm report:noon
0 22 * * * cd /volume1/docker/industry-radar && docker compose run --rm radar pnpm report:night
```

优点：

- 低功耗、长期在线、本地存储稳定。
- SQLite 和报告归档适合放在 NAS volume。
- 数据备份、迁移和权限管理比较清晰。

风险：

- NAS CPU/内存较弱时，Web UI 和采集速度可能一般。
- 不同品牌 NAS 的 Docker 支持差异较大。
- 需要处理目录权限、时区、备份、安全访问控制。
- 个别公开平台可能对 NAS 所在网络质量或 IP 策略敏感。

## 3. Mac mini 运行方案

Mac mini 常开时也适合作为主运行环境。建议使用 launchd 或 cron 调度：

```cron
0 12 * * * cd /Users/lazydog/Documents/行业情报收集系统 && pnpm report:noon
0 22 * * * cd /Users/lazydog/Documents/行业情报收集系统 && pnpm report:night
```

launchd 更适合 macOS：

- 可以指定工作目录、环境变量、日志路径。
- 可以和系统启动、用户登录联动。
- 适合长期常驻 `pnpm serve`。

优点：

- Node/Python 等开发环境更好装。
- 调试方便，遇到页面或接口变化时能快速修复。
- 本机浏览器查看 HTML/Web UI 很顺手。

风险：

- 睡眠、断电、系统更新、网络变化会导致任务错过。
- 需要关闭自动睡眠或配置电源管理。
- 需要明确备份 SQLite 和报告目录。

## 4. VPS / GitHub Actions 方案

GitHub Actions：

- 适合跑临时任务、构建、测试、低频生成。
- 没有天然持久数据库，除非接外部存储。
- 不推荐作为长期个人知识库主运行环境。

VPS：

- 稳定性好，适合长期服务和远程访问。
- 需要自行维护安全、备份、域名、反向代理。
- 部分平台可能对云服务器 IP 更敏感，公开页面可用性未必比家庭网络更好。

结论：

- VPS 可作为备选。
- GitHub Actions 只适合作为辅助，不适合作为主知识库。

## 最终推荐

推荐架构：

1. Codex 负责写代码、维护、异常复盘、周/月趋势分析。
2. NAS 或 Mac mini 负责每天 12:00 和 22:00 长期运行。
3. SQLite 作为主数据库，沉淀事件、来源、标签、实体、反馈和报告归档。
4. HTML 报告 + Web UI 负责日常查看和搜索。
5. Webhook 推送只作为可选通知层，失败不能影响本地报告和数据库写入。

如果 NAS Docker 稳定，优先 NAS；如果 NAS Docker 不稳定或调试不方便，优先 Mac mini。Codex Automations 不建议作为唯一长期运行主机。
