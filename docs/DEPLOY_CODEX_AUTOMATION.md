# Codex Automations 使用建议

Codex Automations 适合辅助维护，不建议作为唯一长期运行主机。

## 适合做

- 每天检查 `run_logs` 中失败的数据源。
- 每周分析哪些关键词命中率低，提出优化。
- 每周生成趋势复盘草稿。
- 定期检查 Web UI、报告模板、数据源适配器是否需要维护。
- 帮你复盘收藏、持续跟踪、已用于视频的事件。
- 在主机已稳定运行的前提下，抽查 `pnpm sources:test`、`pnpm kb:search` 和最新 HTML 报告可读性。

## 不适合做

- 作为唯一数据库运行环境。
- 作为唯一调度器。
- 保存唯一副本的 SQLite 文件。
- 依赖 Codex app、会话额度和项目目录完成每天两次的核心采集。

## 推荐用法

主运行环境放在 NAS 或 Mac mini：

```bash
pnpm report:noon
pnpm report:night
pnpm report:run -- --type night --mock-fallback
```

Codex 只做辅助自动化，例如：

- 每天读取 `run_logs`，总结失败原因。
- 每周运行 `pnpm report:weekly` 后帮你做趋势解释。
- 每周检查 `config/accounts.json` 和关键词配置。

## 结论

Codex 适合作为维护者和行业研究助理，不适合作为唯一长期数据库和唯一长期调度器。
