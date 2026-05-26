# Mac mini 部署

## 安装

```bash
cd /Users/lazydog/Documents/行业情报收集系统
pnpm install
cp .env.example .env
pnpm kb:init
```

如果没有 pnpm：

```bash
npm install -g pnpm@10.12.1
```

## 手动验证

```bash
pnpm report:run -- --type noon --mock
pnpm report:run -- --type night --mock
pnpm report:run -- --type night --mock-fallback
pnpm sources:test
pnpm kb:search -- "OPPO"
pnpm serve
```

## cron 示例

不要直接复制到系统 crontab 前先确认路径和 Node/pnpm 路径。

```cron
0 12 * * * cd /Users/lazydog/Documents/行业情报收集系统 && /usr/local/bin/pnpm report:noon >> logs/cron.log 2>&1
0 22 * * * cd /Users/lazydog/Documents/行业情报收集系统 && /usr/local/bin/pnpm report:night >> logs/cron.log 2>&1
```

查看 pnpm 路径：

```bash
which pnpm
```

## launchd 示例

中午任务示例：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.lazydog.industry-radar.noon</string>
  <key>WorkingDirectory</key>
  <string>/Users/lazydog/Documents/行业情报收集系统</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/pnpm</string>
    <string>report:noon</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>12</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/Users/lazydog/Documents/行业情报收集系统/logs/launchd-noon.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/lazydog/Documents/行业情报收集系统/logs/launchd-noon.err.log</string>
</dict>
</plist>
```

晚间任务把 Label 改成 `com.lazydog.industry-radar.night`，ProgramArguments 改成 `report:night`，Hour 改成 `22`。

## 注意

- Mac mini 不能睡眠，否则定时任务可能错过。
- 系统更新、断电、网络变化会影响采集。
- 建议定期备份 `data/industry-radar.sqlite` 和 `data/reports`。
- 默认数据库路径是 `data/industry-radar.sqlite`，默认报告路径是 `data/reports`；可在 `.env` 里用 `DATABASE_URL` 和 `REPORT_OUTPUT_DIR` 改到外置盘或 NAS 同步目录。
- 公开源失败时不会要求登录、Cookie 或验证码，失败信息会进入报告和 `run_logs`。
