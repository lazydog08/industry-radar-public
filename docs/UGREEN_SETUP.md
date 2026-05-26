# 绿联 NAS（UGOS）部署指南

## 前置条件

绿联 UGOS 基于标准 Linux，cron 行为与普通 Linux 一致，重启后 cron 不会丢失。  
Node 24 推荐通过 **Container Manager**（Docker）安装，也可手动用 NVM 安装。

### 方式一：Container Manager（推荐）

1. 在绿联 App Store 安装「Container Manager」。
2. 确认 Docker 服务运行：`docker --version`。
3. 项目根目录已有 `Dockerfile` 和 `docker-compose.yml`，直接使用。

### 方式二：NVM 手动安装 Node 24

在绿联 SSH 终端（需开启 SSH）：

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 24
nvm use 24
node --version   # 应输出 v24.x.x
npm install -g pnpm@10.12.1
```

---

## 第一步：克隆仓库

SSH 进入绿联 NAS：

```bash
ssh admin@<NAS-IP>
```

下载 bootstrap 脚本并运行：

```bash
REPO_URL=http://<GITEA-IP>:3000/<user>/industry-radar-kb.git \
APP_DIR=/mnt/user-data/shares/industry-radar \
BRANCH=main \
bash /tmp/nas-bootstrap.sh
```

首次部署将 `scripts/nas-bootstrap.sh` 下载到 `/tmp/` 后执行；后续升级在 `APP_DIR` 内重复同一命令。

脚本自动完成 clone/pull、创建运行目录、生成 `.env.local.example`、运行 `pnpm install`。

---

## 第二步：配置 `.env.local`

```bash
cd /mnt/user-data/shares/industry-radar
cp .env.local.example .env.local
vi .env.local
```

必填项：

```bash
DATABASE_URL=./data/industry-radar.sqlite
REPORT_OUTPUT_DIR=./data/reports
PUBLIC_DATA_DIR=./public-data
PUBLISH_DIR=/mnt/user-data/shares/Web/industry-radar/public-data   # 绿联 Web 服务静态目录

BARK_KEY=你的BarkKey
BARK_PUBLIC_URL=https://你的域名/industry-radar/
```

启用 GitHub Pages 自动推送（可选）：

```bash
ENABLE_GITHUB_PAGES_PUSH=true
# publish-github-pages.sh 由 Agent A 提供，放置在 scripts/ 下
```

不提交 `.env.local` 到 Git。

---

## 第三步：手动跑通链路

```bash
cd /mnt/user-data/shares/industry-radar
bash scripts/nas-daily-update.sh noon
```

确认输出有「Report generated」和「Static export done」即为正常。

---

## 第四步：健康检查

```bash
bash scripts/nas-healthcheck.sh
```

---

## 第五步：安装 cron 定时任务

绿联 UGOS 是标准 Linux，cron 重启不丢失，直接使用通用脚本安装：

```bash
cd /mnt/user-data/shares/industry-radar

# 预览将要安装的 cron
bash scripts/nas-schedule.sh print-cron

# 安装（写入当前用户 crontab）
bash scripts/nas-schedule.sh install
```

默认只安装两个任务：
- 中午 12:30：`bash scripts/nas-daily-update.sh noon`
- 晚间 22:30：`bash scripts/nas-daily-update.sh night`

验证：

```bash
crontab -l | grep industry-radar
```

### UGOS cron 路径说明

绿联 UGOS 的用户 crontab 与标准 Linux 一致，存储在 `/var/spool/cron/crontabs/<用户名>`，由系统 crond 服务管理。直接用 `crontab -e` 或 `crontab -` 写入即可，重启后不会丢失，无需额外操作。

### 调整推送时间

默认时间：中午 12:30 + 晚间 22:30。如需修改：

```bash
NOON_TIME=12:30 NIGHT_TIME=22:30 bash scripts/nas-schedule.sh install
```

如需加早报：

```bash
MORNING_TIME=08:00 NOON_TIME=12:30 NIGHT_TIME=22:30 bash scripts/nas-schedule.sh install
```

---

## 验收

1. 等待下一个整点前后 5 分钟，检查 `logs/nas-daily/` 下有无新日志。
2. `bash scripts/nas-healthcheck.sh` 通过。
3. 浏览器访问 `PUBLISH_DIR` 对应的网页地址，能看到 `public-data/overview.json`。
4. 如果配了 Bark，手机收到推送通知。Bark 配置详见 `docs/BARK_SETUP.md`。

---

## 常用参考

- 安装细节：`docs/NAS_INSTALL.md`
- 定时任务说明：`docs/NAS_SCHEDULE.md`
- 验收清单：`docs/NAS_ACCEPTANCE.md`
- 静态发布：`docs/NAS_WEB_PUBLISH.md`
- 监控告警：`docs/NAS_OBSERVABILITY.md`
- Bark 配置：`docs/BARK_SETUP.md`
