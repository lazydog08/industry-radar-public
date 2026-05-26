# NAS 一键安装/升级入口

本文用于把本地 Gitea 里的行业情报雷达仓库部署到 NAS，并在后续升级时安全拉取代码、准备运行目录和安装依赖。

脚本入口：

```bash
bash scripts/nas-bootstrap.sh
```

## 目录建议

建议把源码和运行数据放在 NAS 的持久化目录，例如：

```bash
/volume1/docker/industry-radar
```

如果 NAS 型号或系统不同，也可以放在当前用户目录：

```bash
~/industry-radar-kb
```

脚本默认使用 `~/industry-radar-kb`。正式部署建议显式设置 `APP_DIR`，方便后续定时任务写固定路径。

## 首次部署

在 NAS 上准备好 Git、Node 24 和 Corepack/pnpm 后，先把 `scripts/nas-bootstrap.sh` 放到 NAS 的任意临时目录。可以从已经有的项目 checkout 复制，也可以先在 Gitea 网页里下载这个脚本。

然后在脚本所在目录执行：

```bash
REPO_URL=http://192.168.31.50:3000/lazydog/industry-radar-kb.git \
APP_DIR=/volume1/docker/industry-radar \
BRANCH=main \
bash scripts/nas-bootstrap.sh
```

默认 `REPO_URL` 是局域网内 Gitea 的 HTTP 地址，只适合可信 LAN。若未来跨网络访问，建议改为 HTTPS 或 SSH remote。

脚本会做这些事：

- 如果 `APP_DIR` 不存在，创建父目录并从 `REPO_URL` clone。
- 如果 `APP_DIR` 已经是 Git 仓库，拉取 `BRANCH` 的最新代码。
- 创建 `data/`、`data/reports/`、`data/public/`、`public-data/`、`public-data/reports/`、`logs/`、`logs/nas-daily/`。
- 如果没有 `.env.local`，只生成 `.env.local.example` 或提示从 `.env.example` 复制。
- 默认运行 `pnpm install`。

脚本不会删除已有数据，不会创建真实 `.env.local`，不会写入 Bark Key、OpenAI Key、cookies、密码或其它 secrets。

## 升级

以后升级同一个目录时重复运行同一条命令即可：

```bash
APP_DIR=/volume1/docker/industry-radar bash scripts/nas-bootstrap.sh
```

如果目录内已有 `.git`，脚本会执行 `git fetch` 和 `git pull --ff-only`。如果本地有未提交改动导致无法快进，脚本会停止并让你先处理本地改动，避免覆盖其它 agent 或用户的工作。

## 可覆盖环境变量

```bash
REPO_URL=http://192.168.31.50:3000/lazydog/industry-radar-kb.git
APP_DIR=/volume1/docker/industry-radar
BRANCH=main
PNPM_VERSION=10.12.1
RUN_INSTALL=true
```

- `REPO_URL`：Gitea 仓库地址。
- `APP_DIR`：NAS 上的应用目录。
- `BRANCH`：部署分支，默认 `main`。
- `PNPM_VERSION`：提示和 Corepack 版本参考，默认 `10.12.1`。
- `RUN_INSTALL=false`：只更新代码和目录，不安装依赖。

## pnpm 和 Corepack

依赖安装优先使用系统里的 `pnpm`。如果没有 `pnpm`，脚本会尝试使用 `corepack pnpm`。

如果两者都不可用，脚本会停止并提示你先安装 Node/Corepack 或手动启用 pnpm。它不会自动改系统包管理器设置，也不会用危险方式修改 NAS 环境。

项目依赖 Node.js 24+。如果 NAS 系统套件只提供 Node 18/20，建议使用 Node 24 容器、nvm/Volta，或 NAS 套件支持的新版 Node 环境，再运行 `pnpm install` 和健康检查。

## 本地配置和 secrets

首次部署后，在 NAS 上手动创建：

```bash
cd /volume1/docker/industry-radar
cp .env.local.example .env.local
```

然后只在 `.env.local` 填写 NAS 本机路径和可选通知配置：

```bash
DATABASE_URL=./data/industry-radar.sqlite
REPORT_OUTPUT_DIR=./data/reports
PUBLIC_DATA_DIR=./data/public
PUBLISH_DIR=/volume1/web/industry-radar/public-data
BARK_KEY=
BARK_PUBLIC_URL=https://你的网页地址/
```

`.env.local`、SQLite 数据库、日志、运行报告、Bark Key、OpenAI Key、cookies 和密码都只留在 NAS 本机，不提交到 Gitea。

## 接下一步定时任务

安装和 `.env.local` 配好后，先手动跑一次：

```bash
cd /volume1/docker/industry-radar
bash scripts/nas-daily-update.sh noon
```

确认报告、静态 JSON 和可选 Bark 通知正常后，再接 NAS 任务计划或 cron：

```cron
0 8 * * * cd /volume1/docker/industry-radar && /bin/bash scripts/nas-daily-update.sh morning >> logs/nas-cron.log 2>&1
0 12 * * * cd /volume1/docker/industry-radar && /bin/bash scripts/nas-daily-update.sh noon >> logs/nas-cron.log 2>&1
0 22 * * * cd /volume1/docker/industry-radar && /bin/bash scripts/nas-daily-update.sh night >> logs/nas-cron.log 2>&1
```

日更脚本的完整配置、发布目录切换策略和 Bark 接入见 [NAS_DAILY_UPDATE.md](NAS_DAILY_UPDATE.md) 与 [BARK_SETUP.md](BARK_SETUP.md)。

## 验证

修改脚本后至少运行：

```bash
bash -n scripts/nas-bootstrap.sh
```

如果 NAS 上已经有 Node/pnpm 环境，可以再执行：

```bash
RUN_INSTALL=false APP_DIR=/volume1/docker/industry-radar bash scripts/nas-bootstrap.sh
```

这会验证 Git 更新、配置模板和运行目录创建流程，但跳过依赖安装。
