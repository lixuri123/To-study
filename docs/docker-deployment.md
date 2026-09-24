# 青笺 Docker 部署

本方案用一个容器运行 FastAPI，并由 FastAPI 提供编译后的 Web 页面。SQLite 数据保存在服务器目录 `/opt/qingjian/data`，重建容器不会删除数据。SQLite 部署只运行一个应用实例和一个 Uvicorn worker。

## 一 首次部署并迁移现有数据

在本机项目根目录创建 SQLite 一致性备份。目标文件必须不存在：

```powershell
New-Item -ItemType Directory -Force backups
uv run python scripts/database_backup.py data/app.db backups/app-cloud.db
```

上传代码和备份文件。代码可以通过 GitHub 克隆，备份文件不要提交到 Git：

```powershell
scp backups/app-cloud.db USER@SERVER:/tmp/qingjian-app.db
```

在服务器执行：

```bash
sudo mkdir -p /opt/qingjian/data
sudo mv /tmp/qingjian-app.db /opt/qingjian/data/app.db
sudo chown -R 10001:10001 /opt/qingjian/data

git clone https://github.com/lixuri123/To-study.git /opt/qingjian/app
cd /opt/qingjian/app
cp .env.example .env
```

编辑 `.env`，填写实际域名。使用 HTTPS 时保留：

```dotenv
COOKIE_SECURE=true
TRUSTED_ORIGINS=https://qingjian.example.com
```

构建并启动：

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app
```

容器启动时自动执行 `alembic upgrade head`。健康检查地址为 `http://127.0.0.1:8000/api/health`。

## 二 反向代理

Compose 默认只把应用发布到服务器回环地址 `127.0.0.1:8000`。由服务器上的 Caddy 或 Nginx代理该地址并终止 HTTPS。不要在未配置防火墙和 HTTPS 的情况下把登录服务直接暴露到公网。

Caddy 示例：

```caddyfile
qingjian.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

## 三 更新应用

先备份服务器数据库，再更新代码和重建容器：

```bash
cd /opt/qingjian/app
docker compose exec app python scripts/database_backup.py \
  /app/data/app.db \
  /app/data/app-before-update-$(date +%Y%m%d-%H%M%S).db
git pull --ff-only
docker compose up -d --build
docker compose ps
```

宿主机目录 `/opt/qingjian/data` 独立于镜像和容器，不会因重建而消失。

## 四 恢复数据库

不要覆盖正在使用的 SQLite 文件。先停止服务并保留旧文件：

```bash
cd /opt/qingjian/app
docker compose down
sudo mv /opt/qingjian/data/app.db /opt/qingjian/data/app.db.previous
sudo cp /opt/qingjian/data/VERIFIED_BACKUP.db /opt/qingjian/data/app.db
sudo chown 10001:10001 /opt/qingjian/data/app.db
docker compose up -d
```

## 五 MCP 重新连接

`data/mcp-credentials.json` 使用本机凭据保护，不应上传服务器或提交 Git。域名启用后，在运行 Codex 的电脑上重新执行青笺 MCP 登录，并把服务地址改为新的 HTTPS 地址。
