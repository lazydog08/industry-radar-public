# Bark 推送配置

NAS 日更脚本会在流程成功或失败后调用：

```bash
pnpm notify:bark
```

通知脚本只读取环境变量，不会把 Bark Key、日志路径、数据库路径或本机绝对路径写进推送正文。

## 配置

在项目根目录创建 `.env.local`，不要提交这个文件。

```bash
BARK_KEY=your_bark_key
BARK_PUBLIC_URL=https://example.com/industry-radar/
BARK_SOUND=done
BARK_TIMEOUT_MS=10000
```

也可以不用 `BARK_KEY`，直接提供完整 Bark base URL：

```bash
BARK_NOTIFY_URL=https://api.day.app/your_bark_key
BARK_PUBLIC_URL=https://example.com/industry-radar/
```

- `BARK_KEY`：Bark 设备 Key。脚本会拼成 `https://api.day.app/<key>`。
- `BARK_NOTIFY_URL`：完整 Bark base URL。设置后优先于 `BARK_KEY`。
- `BARK_PUBLIC_URL`：点开通知时打开的线上情报页面。
- `BARK_SITE_URL`：和 `BARK_PUBLIC_URL` 作用相同，优先级更高，适合定时任务临时覆盖。
- `BARK_SOUND`：Bark 声音，例如 `done`。为空时脚本按报告类型自动选择默认声音（见「声音策略」）。
- `BARK_INCLUDE_TOP`：是否在成功通知中附加「今日必看 Top」，默认 `true`。设为 `false` 时退回原简报格式。
- `BARK_DRY_RUN=true`：只打印将发送的标题和正文，不发网络请求。
- `BARK_TIMEOUT_MS`：Bark 请求超时时间，默认 `10000` 毫秒。

## 推送内容

推送正文包含固定五行：

```text
状态
日期/类型
新增条数
高分条数
网页地址
```

即使 `nas-daily-update.sh` 传入了日志文件位置或本机路径，通知正文也不会发送这些内容。

### 今日必看 Top

成功通知在五行之后，会从 `PUBLIC_DATA_DIR/overview.json` 读取 `events` 数组，自动附加最多 3 条「今日必看」标题：

```text
今日必看：
• 【A】鸿蒙智行起诉自媒体"圈内人 Xm_"，索赔 200 万元
• 【B】OPPO 影像旗舰新机发布会定档，最大悬念曝光
• 【B】抖音平台创作者分成规则调整，头部账号影响最大
```

挑选逻辑：优先取 `radar_section === "must_read"` 的条目，不足 3 条时按 `radar_score` 降序补齐。标题超过 30 个字符时截断。若当日无强信号，附加一行「今日无强信号，可休息一日」。

文件不存在或解析失败时**静默降级**——仍发送原有五行简报，仅在 stderr 输出一行 warning，不影响通知送达。

设置 `BARK_INCLUDE_TOP=false` 可完全关闭此功能，退回原简报格式。失败通知不会附加 Top 内容。

## 声音策略

脚本按以下优先级决定推送声音：

1. **失败状态**：强制使用 `alarm`，无论用户如何配置 `BARK_SOUND`，让失败更醒目。
2. **用户显式设置 `BARK_SOUND`**：尊重用户配置（失败除外）。
3. **未设置 `BARK_SOUND` 时按报告类型自动选择**：
   - `BARK_RUN_TYPE=noon`（午报）→ `birdsong`（轻柔，不打扰午间）
   - `BARK_RUN_TYPE=night`（晚报）→ `bell`（清晰提示感）

## 手动验证

dry-run 验证不会真实推送：

```bash
BARK_DRY_RUN=true BARK_KEY=example pnpm notify:bark
```

模拟成功通知：

```bash
BARK_DRY_RUN=true BARK_KEY=example BARK_STATUS=success BARK_RUN_TYPE=noon BARK_NEW_COUNT=12 BARK_HIGH_COUNT=3 pnpm notify:bark
```

模拟失败通知：

```bash
BARK_DRY_RUN=true BARK_KEY=example BARK_STATUS=failed BARK_RUN_TYPE=night pnpm notify:bark
```

## NAS 日更接入

`scripts/nas-daily-update.sh` 已经在成功和失败时调用 `notify:bark`。正式启用时只需要在 NAS 的 `.env.local` 填入：

```bash
BARK_KEY=your_bark_key
BARK_PUBLIC_URL=https://你的网页地址/
```

如果 Bark 网络请求失败，日更脚本会保留本地结果并在日志里记录通知失败，不会删除或回滚已经生成的网页数据。

完整 NAS 定时抓取、静态发布和 Git 边界见 [NAS_DAILY_UPDATE.md](NAS_DAILY_UPDATE.md)。Bark Key 只写在 NAS 本地 `.env.local`，不要提交到 Gitea，也不要写进文档。
