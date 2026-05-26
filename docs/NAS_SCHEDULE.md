# NAS 定时任务管理

`scripts/nas-schedule.sh` 用来安装、查看、卸载 NAS 上的行业情报日更 cron 任务。它只管理带 marker 的本项目任务块，不会删除用户 crontab 里的其他任务。

当前默认只安装午报和晚报：

- 午报：`12:30 noon`
- 晚报：`22:30 night`

早报默认不启用；需要时显式设置 `MORNING_TIME=08:00`。

日志默认写入 `logs/nas-daily`，也可以用 `NAS_LOG_DIR` 指向 NAS 持久化目录。cron 包装日志会按天拆成 `cron-noon-YYYYMMDD.log`、`cron-night-YYYYMMDD.log`，日更脚本自身日志形如 `YYYY-MM-DD-noon-时间戳.log`。定时任务默认清理 14 天以前的这两类日志。

## 安装

绿联 UGOS 推荐项目路径：

```bash
cd /mnt/user-data/shares/industry-radar
/bin/bash scripts/nas-schedule.sh install
```

如果项目不在当前脚本所在仓库路径，可以覆盖 `APP_DIR`：

```bash
APP_DIR=/mnt/user-data/shares/industry-radar /bin/bash scripts/nas-schedule.sh install
```

覆盖运行时间：

```bash
NOON_TIME=12:30 NIGHT_TIME=22:30 /bin/bash scripts/nas-schedule.sh install
```

如需加早报：

```bash
MORNING_TIME=08:00 NOON_TIME=12:30 NIGHT_TIME=22:30 /bin/bash scripts/nas-schedule.sh install
```

延长 cron 包装日志保留时间：

```bash
CRON_LOG_RETENTION_DAYS=30 /bin/bash scripts/nas-schedule.sh install
```

脚本会先删除旧的本项目 marker block，再写入新的 block，所以重复执行不会产生重复任务。

## 查看状态

```bash
/bin/bash scripts/nas-schedule.sh status
```

已安装时会打印当前 crontab 里的项目任务块；未安装时会打印建议安装的 cron 内容。

## 卸载

```bash
/bin/bash scripts/nas-schedule.sh uninstall
```

卸载只删除下面两个 marker 之间的内容：

```text
# >>> industry-radar nas-schedule managed block
# <<< industry-radar nas-schedule managed block
```

用户自己添加的其他 cron 任务不会被删除。

## 打印 cron 内容

部分 NAS shell 没有 `crontab` 命令，或者只允许通过控制面板添加计划任务。这时可以打印可复制内容：

```bash
/bin/bash scripts/nas-schedule.sh print-cron
```

如果 `install` 发现 `crontab` 不可用，也会直接打印同一份 cron 内容，不会只给一个模糊失败。

## NAS 面板计划任务

在绿联等 NAS 控制面板里，也可以不用系统 crontab。做法是先执行：

```bash
cd /mnt/user-data/shares/industry-radar
/bin/bash scripts/nas-schedule.sh print-cron
```

然后把输出中 `noon` 和 `night` 两条任务复制到 NAS 的计划任务面板。建议把 NAS 系统时区设置为 `Asia/Shanghai`。脚本生成的 cron block 会包含 `CRON_TZ=Asia/Shanghai`，但不同 NAS 的 cron 实现兼容性不完全一致，系统时区仍是最稳妥的基准。

## 手动测试

先检查脚本语法：

```bash
bash -n scripts/nas-schedule.sh
```

再打印计划任务确认路径和时间：

```bash
/bin/bash scripts/nas-schedule.sh print-cron
```

最后手动跑一次已有 daily update 入口：

```bash
/bin/bash scripts/nas-daily-update.sh noon
```

如果配置了 Bark，成功或失败通知由 `scripts/nas-daily-update.sh` 里的现有通知逻辑发送。定时管理脚本本身不读取、不打印、不写入 Bark Key、数据库内容或 `.env` 密钥。
