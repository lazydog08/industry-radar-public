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
- `BARK_SOUND`：Bark 声音，例如 `done`。为空则使用 Bark 默认声音。
- `BARK_DRY_RUN=true`：只打印将发送的标题和正文，不发网络请求。
- `BARK_TIMEOUT_MS`：Bark 请求超时时间，默认 `10000` 毫秒。

## 推送内容

推送正文只包含：

```text
状态
日期/类型
新增条数
高分条数
网页地址
```

即使 `nas-daily-update.sh` 传入了日志文件位置或本机路径，通知正文也不会发送这些内容。

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
