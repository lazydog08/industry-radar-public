# NAS 静态网页发布

本方案用于把 `src/web` 的只读网页和 NAS 定时导出的 `public-data` 放到同一个静态站点里。线上 HTTP 服务只需要提供静态文件，不需要连接 SQLite，也不需要暴露项目源码、日志或 `.env`。

## 推荐目录结构

把仓库运行目录和 Web 公开目录分开：

```text
/volume1/docker/industry-radar/          # 项目运行目录，不对外提供 HTTP
  .env.local
  data/industry-radar.sqlite
  data/public/                           # PUBLIC_DATA_DIR，可由脚本生成
  logs/
  scripts/nas-daily-update.sh
  src/web/

/volume1/web/industry-radar/             # Web Station / Nginx / Caddy 站点根目录
  index.html
  styles.css
  app.js
  public-data/
    overview.json
    events.json
    knowledge.json
    meta.json
    reports/
      index.json
      ...
```

Web 服务根目录应指向 `/volume1/web/industry-radar/`，不是项目根目录。这样浏览器访问 `/public-data/overview.json` 时只能读到公开 JSON，不能读到 SQLite、日志、环境变量或源码。

## PUBLISH_DIR 指向哪里

`scripts/nas-daily-update.sh` 的 `PUBLISH_DIR` 只负责发布数据目录，因此应指向站点根目录下的 `public-data`：

```bash
DATABASE_URL=/volume1/docker/industry-radar/data/industry-radar.sqlite
REPORT_OUTPUT_DIR=/volume1/docker/industry-radar/data/reports
PUBLIC_DATA_DIR=/volume1/docker/industry-radar/data/public
PUBLISH_DIR=/volume1/web/industry-radar/public-data
```

`index.html`、`styles.css`、`app.js` 是页面壳，通常只在代码更新时手动同步一次：

```bash
mkdir -p /volume1/web/industry-radar
cp src/web/index.html src/web/styles.css src/web/app.js /volume1/web/industry-radar/
```

之后 NAS 每日任务只需要刷新 `PUBLISH_DIR`。页面会优先读取 `/public-data/overview.json`，前端代码不需要重新构建。

## Web Station / Nginx / Caddy

Web Station：创建静态站点，文档根目录选择 `/volume1/web/industry-radar`。站点可以绑定 NAS 局域网 IP 的 HTTP 端口，也可以绑定反向代理域名。

Nginx 示例：

```nginx
server {
  listen 8088;
  server_name _;
  root /volume1/web/industry-radar;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

Caddy 示例：

```caddyfile
:8088 {
  root * /volume1/web/industry-radar
  file_server
  try_files {path} /index.html
}
```

任意静态目录也可以使用同样结构：站点根目录放三个网页文件，站点根目录下的 `public-data/` 放 JSON 和报告文件。

## 手机访问

手机和 NAS 需要在同一局域网，或通过你信任的内网穿透 / VPN 访问。先在电脑上确认页面可打开：

```text
http://NAS局域网IP:端口/
http://NAS局域网IP:端口/public-data/overview.json
```

再用手机浏览器访问同一个地址。若打不开，优先检查 NAS 防火墙、Web Station 端口、路由器是否允许同网段访问，以及手机是否在同一个 Wi-Fi。不要为了手机访问把项目根目录、数据库目录或日志目录设为 Web 根目录。

## 避免泄露 SQLite / logs / secrets

- Web 根目录只放 `index.html`、`styles.css`、`app.js` 和 `public-data/`。
- 不要把 `/volume1/docker/industry-radar`、仓库根目录、`data/runtime`、`logs`、`backups`、`.env.local` 设为 Web 根目录。
- `DATABASE_URL`、`REPORT_OUTPUT_DIR`、`PUBLIC_DATA_DIR` 可以放在项目运行目录；只有 `PUBLISH_DIR` 指向 Web 公开目录下的 `public-data`。
- `public-data` 里只应包含前端可公开展示的 JSON、报告索引和报告静态文件。上线前可直接打开 `/public-data/overview.json` 检查是否包含本地路径、Cookie、Token、密码或私人备注。
- Git 只同步代码和文档，不提交 `.env`、SQLite、日志、运行缓存或生成报告。

## 回滚到 .previous

`nas-daily-update.sh` 发布时会先把新数据复制到候选目录，再切换 `PUBLISH_DIR`。成功切换后，上一个版本保留为同父目录下的 `.previous`：

```text
/volume1/web/industry-radar/public-data
/volume1/web/industry-radar/public-data.previous
```

如果新数据有问题，可以在 NAS 上手动回滚：

```bash
cd /volume1/web/industry-radar
mv public-data public-data.bad-$(date +%Y%m%d-%H%M%S)
mv public-data.previous public-data
```

回滚后刷新浏览器即可。若 Web 服务有缓存，清理缓存或强制刷新页面。

## 本地预览

预览脚本会组装一个临时静态站点，只复制 `src/web/index.html`、`src/web/styles.css`、`src/web/app.js` 和公开数据目录到 `public-data/`，不会复制 `data/runtime`、`logs` 或 SQLite。

默认读取项目根目录的 `public-data`：

```bash
scripts/nas-web-preview.sh
```

常用覆盖项：

```bash
PUBLIC_DATA_DIR=./data/public PORT=3899 HOST=0.0.0.0 scripts/nas-web-preview.sh
WEB_PREVIEW_DIR=/tmp/industry-radar-preview scripts/nas-web-preview.sh
WEB_ROOT=/volume1/web/industry-radar scripts/nas-web-preview.sh
```

- `HOST` 默认 `127.0.0.1`，只允许本机访问；手机预览需要设为 `0.0.0.0`，再访问电脑的局域网 IP。
- `PORT` 默认 `3888`。
- `PUBLIC_DATA_DIR` 指向已经导出的静态数据目录。
- `WEB_PREVIEW_DIR` 指向本地预览目录；不设置时使用临时目录。
- `WEB_ROOT` 可用于把同一套文件组装到一个指定静态目录；正式 NAS 上仍建议让 `PUBLISH_DIR` 只更新 `WEB_ROOT/public-data`。
