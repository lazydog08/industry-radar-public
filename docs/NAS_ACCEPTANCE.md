# NAS 验收健康检查

`scripts/nas-healthcheck.sh` 是本地和 NAS 都可运行的验收入口，用来确认项目从代码、构建、mock 日更、静态 JSON 到 Bark dry-run 的闭环可用。默认只写入隔离目录，不碰真实 SQLite、默认 `public-data` 或线上发布目录。

## 验收命令

推荐先在本机跑：

```bash
bash scripts/nas-healthcheck.sh
```

在 NAS 上进入仓库目录后也运行同一条命令：

```bash
cd /volume1/docker/industry-radar
bash scripts/nas-healthcheck.sh
```

只检查脚本语法：

```bash
bash -n scripts/nas-healthcheck.sh
```

默认写入目录类似：

```text
data/runtime/nas-healthcheck-YYYYMMDD-HHMMSS/
```

里面会包含本次验收用的 SQLite、报告、静态 JSON、日志和可选发布演练目录。成功通过时默认会清理这个隔离目录，避免 NAS 长期积累健康检查产物；失败时会保留目录方便排障。

## 通过标准

脚本末尾会输出汇总：

```text
NAS healthcheck summary
  PASS: N
  WARN: N
  FAIL: 0
```

通过标准是：

- `FAIL: 0`，脚本退出码为 `0`。
- Git 仓库可识别。
- Node.js 满足 `package.json` 要求，pnpm 可用。
- `typecheck` 和隔离 TypeScript build 通过；健康检查会把 build 输出写入本次 `RUN_DIR/dist`，不覆盖线上 `dist/`。
- mock 日更在隔离数据库和报告目录中完成。
- 静态 JSON 导出目录包含并能解析这些文件：
  - `overview.json`
  - `events.json`
  - `knowledge.json`
  - `reports/index.json`
  - `meta.json`
- Bark 验证使用 `BARK_DRY_RUN=true BARK_KEY=example pnpm notify:bark`，不会发真实请求。

`WARN` 不一定阻塞验收，常见情况是工作区有本地改动、`PUBLISH_DIR` 已配置但健康检查按默认策略没有写入真实发布目录。

## 路径和开关

默认安全模式：

```bash
bash scripts/nas-healthcheck.sh
```

默认安全模式会设置：

```text
DATABASE_URL=data/runtime/nas-healthcheck-*/industry-radar.sqlite
REPORT_OUTPUT_DIR=data/runtime/nas-healthcheck-*/reports
PUBLIC_DATA_DIR=data/runtime/nas-healthcheck-*/public-data
```

如果需要指定隔离目录：

```bash
HEALTHCHECK_RUN_DIR=./data/runtime/nas-healthcheck-manual bash scripts/nas-healthcheck.sh
```

如果通过后仍想保留隔离目录：

```bash
HEALTHCHECK_KEEP_RUN_DIR=true bash scripts/nas-healthcheck.sh
```

如果确实要按当前环境变量使用真实路径，需要显式打开：

```bash
HEALTHCHECK_USE_REAL_PATHS=true HEALTHCHECK_ALLOW_REAL_WRITES=true bash scripts/nas-healthcheck.sh
```

这会使用当前环境里的 `DATABASE_URL`、`REPORT_OUTPUT_DIR`、`PUBLIC_DATA_DIR` / `EXPORT_SITE_DIR`，并会向配置的数据库写入 mock 验证数据。上线前一般不需要这个开关，除非你正在做真实 NAS 路径的最终人工验收；默认安全模式不会碰真实数据库。

## 发布目录验收

如果环境里配置了 `PUBLISH_DIR`，健康检查默认只提醒，不会写入该目录：

```text
WARN PUBLISH_DIR is configured but was not written: ...
```

如果要测试发布目录结构，使用隔离发布目录：

```bash
HEALTHCHECK_TEST_PUBLISH=true bash scripts/nas-healthcheck.sh
```

这个模式仍不会写真实 `PUBLISH_DIR`，只会把本次生成的静态 JSON 复制到：

```text
data/runtime/nas-healthcheck-*/publish/public-data/
```

## 常见失败和处理

`Node.js ... package.json requires >=24`

安装或切换到 Node.js 24 以上后重跑。NAS 系统自带 Node 可能停在 18/20，建议使用 Node 24 容器、nvm/Volta，或 NAS 套件支持的新版 Node 环境，避免 `node:sqlite` 运行能力不一致。

`pnpm is not available`

先在 NAS 环境安装或启用 pnpm，再重跑：

```bash
corepack enable
corepack prepare pnpm@10.12.1 --activate
```

`pnpm typecheck` 或隔离 TypeScript build 失败

查看汇总里给出的日志文件，例如：

```text
data/runtime/nas-healthcheck-*/logs/pnpm-typecheck-.log
```

先修复 TypeScript 或构建错误，再验收 NAS。

`isolated mock report` 失败

通常是依赖未安装、SQLite 写入目录不可写，或 mock 样本文件缺失。先确认：

```bash
pnpm install
ls data/sample/mock-source-items.json
```

`public-data file missing or empty`

说明静态导出没有产出完整线上 JSON。先看 `isolated-static-export` 日志，再单独用同样的隔离路径复现：

```bash
DATABASE_URL=./data/runtime/nas-healthcheck-manual/industry-radar.sqlite \
REPORT_OUTPUT_DIR=./data/runtime/nas-healthcheck-manual/reports \
PUBLIC_DATA_DIR=./data/runtime/nas-healthcheck-manual/public-data \
pnpm export:site
```

`Bark dry-run` 失败

健康检查使用的是示例 Key 和 dry-run，不会联网发送。失败通常表示 `notify:bark` 脚本、依赖或 TypeScript 运行环境有问题。先跑：

```bash
BARK_DRY_RUN=true BARK_KEY=example pnpm notify:bark
```

确认输出里出现 `Bark dry-run: request not sent.`。

## 安全边界

- 不提交 `.env`、`.env.local`、Bark Key、cookies、SQLite、运行日志或真实报告缓存。
- 默认不写真实 `DATABASE_URL`、默认 `public-data`、真实 `PUBLISH_DIR`。
- 验收数据放在 `data/runtime/nas-healthcheck-*`，属于本地运行产物，不进入评审 diff。
- Claude 只做只读 review；需要修改时由 Codex 执行。
