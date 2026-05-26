# QNAP NAS 部署指南

## 前置条件

QNAP 原生不带 Node 24，推荐用 **Container Station** 跑 Docker 容器。  
项目根目录已有 `Dockerfile` 和 `docker-compose.yml`，默认走容器方式。

### 安装 Container Station

1. 在 QNAP App Center 搜索「Container Station」并安装。
2. 打开 Container Station，确认 Docker 服务已启动。
3. 在 SSH 终端执行 `docker --version` 确认可用（需要 20+ 版本）。

### 进入 NAS SSH

在 QNAP 控制台 → 网络与文件服务 → Telnet/SSH → 开启 SSH，然后：

```bash
ssh admin@<NAS-IP>
```

---

## 第一步：克隆仓库

```bash
REPO_URL=http://<GITEA-IP>:3000/<user>/industry-radar-kb.git \
APP_DIR=/share/Container/industry-radar \
BRANCH=main \
bash /tmp/nas-bootstrap.sh
```

首次部署：先把 `scripts/nas-bootstrap.sh` 下载到 NAS 的 `/tmp/`，或在 Gitea 网页直接下载。  
后续升级：在 `APP_DIR` 内重复执行即可。

脚本会自动完成 clone/pull、创建运行目录、生成 `.env.local.example`、运行 `pnpm install`。

---

## 第二步：配置 `.env.local`

```bash
cd /share/Container/industry-radar
cp .env.local.example .env.local
vi .env.local
```

必填项：

```bash
DATABASE_URL=./data/industry-radar.sqlite
REPORT_OUTPUT_DIR=./data/reports
PUBLIC_DATA_DIR=./public-data
PUBLISH_DIR=/share/Web/industry-radar/public-data   # QNAP Web Station 静态目录

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
cd /share/Container/industry-radar
bash scripts/nas-daily-update.sh noon
```

确认输出有「Report generated」和「Static export done」即为正常。

也可用 pnpm（需要容器或已安装 Node 24 + pnpm）：

```bash
pnpm nas:daily -- noon
```

---

## 第四步：健康检查

```bash
bash scripts/nas-healthcheck.sh
```

---

## 第五步：安装 QNAP 专用 cron

**QNAP 重要机制**：用户 crontab 在 NAS 重启后会丢失。  
必须写入 `/etc/config/crontab` 并执行 `crontab /etc/config/crontab` 重新加载，才能在重启后保留。

使用本项目提供的专用脚本：

```bash
cd /share/Container/industry-radar

# 先 dry-run 预览写入内容
QNAP_CRONTAB_PATH=/tmp/test-crontab bash scripts/qnap-install-cron.sh --dry-run

# 确认无误后正式安装（需要 root/admin 权限）
bash scripts/qnap-install-cron.sh
```

脚本做的事：

1. 调用 `scripts/nas-schedule.sh print-cron` 生成 cron 块（默认只安装 12:30 和 22:30 两个任务）。
2. 读取 `/etc/config/crontab`，移除旧的 managed block，追加新块。
3. 执行 `crontab /etc/config/crontab` 重新加载，立即生效。
4. QNAP 重启后系统会自动从 `/etc/config/crontab` 恢复 cron，**不会丢失**。

验证：

```bash
crontab -l | grep industry-radar
```

### 调整推送时间

默认时间：中午 12:30 + 晚间 22:30。如需修改：

```bash
NOON_TIME=12:30 NIGHT_TIME=22:30 bash scripts/qnap-install-cron.sh
```

如需加早报：

```bash
MORNING_TIME=08:00 NOON_TIME=12:30 NIGHT_TIME=22:30 bash scripts/qnap-install-cron.sh
```

### 使用容器方式运行

如果 QNAP 不方便直接运行 Node，也可在 Container Station 里启动容器后进入容器执行：

```bash
docker exec -it industry-radar bash scripts/qnap-install-cron.sh
```

或在 `docker-compose.yml` 中配置 cron 定时任务。

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
