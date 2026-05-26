# NAS 部署

## 推荐方式

如果 NAS 支持 Docker / Container Manager / Container Station，推荐使用 Docker Compose。数据库和报告目录必须挂载到 NAS volume，避免容器重建丢数据。

## 首次部署

```bash
cd /volume1/docker/industry-radar
cp .env.example .env
docker compose build
docker compose run --rm radar pnpm kb:init
```

## 手动运行

```bash
docker compose run --rm radar pnpm report:noon
docker compose run --rm radar pnpm report:night
docker compose run --rm radar pnpm report:run -- --type noon --mock
docker compose run --rm radar pnpm report:run -- --type night --mock-fallback
docker compose run --rm radar pnpm kb:search -- "小米汽车"
docker compose run --rm radar pnpm sources:test
```

## NAS 计划任务 / cron

```cron
0 12 * * * cd /volume1/docker/industry-radar && docker compose run --rm radar pnpm report:noon >> logs/nas-cron.log 2>&1
0 22 * * * cd /volume1/docker/industry-radar && docker compose run --rm radar pnpm report:night >> logs/nas-cron.log 2>&1
```

## Web UI

```bash
docker compose up -d radar
```

访问：

```text
http://NAS_IP:3877
```

默认数据库在容器内 `/app/data/industry-radar.sqlite`，通过 `./data:/app/data` 挂载到 NAS；报告在 `/app/data/reports`，对应宿主机 `./data/reports`。

## 备份

```bash
mkdir -p backups
cp data/industry-radar.sqlite "backups/industry-radar-$(date +%F).sqlite"
tar -czf "backups/reports-$(date +%F).tar.gz" data/reports
```

## 风险

- NAS 性能较弱时，构建和 Web UI 会慢。
- 不同 NAS 的 Docker 权限和挂载规则不同。
- 需要确保容器时区是 `Asia/Shanghai`。
- 对外开放 Web UI 时必须自行加访问控制或只在内网使用。
- 知乎、微博、B站公开接口可能因为网络或风控临时失败；系统不会绕过登录或验证码，会在报告里标注异常。
