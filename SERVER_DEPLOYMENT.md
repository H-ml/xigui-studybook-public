# 单用户服务器部署

本项目没有账号系统。服务器部署仅适合一个人使用，推荐通过 Tailscale 私网访问；如果使用公网域名，必须在反向代理层增加 HTTPS 和访问认证。

## 目录准备

在项目目录中准备：

```text
data/                    # 个人状态，初始可为空
materials/textbook.pdf   # 自行准备
materials/pages/         # 本地或服务器生成
```

复制配置并按需修改考试日期、端口和资料路径：

```bash
cp .env.example .env
```

## 启动

```bash
docker compose -f deploy/docker-compose.server.yml up -d --build
docker compose -f deploy/docker-compose.server.yml ps
```

服务默认只绑定 `127.0.0.1:3100`，容器内部端口为 3000。健康检查地址是 `/api/health`。

## 推荐：Tailscale 私网

服务器和使用设备加入同一 tailnet 后执行：

```bash
tailscale serve --bg 127.0.0.1:3100
tailscale serve status
```

不要使用 `tailscale funnel`，否则服务会被公开到互联网。

## 可选：公网域名

使用 [deploy/Caddyfile.example](deploy/Caddyfile.example) 作为起点，替换域名、用户名和密码哈希。密码哈希可通过以下命令交互生成：

```bash
caddy hash-password
```

只允许 Caddy 对外监听 80/443，应用端口继续绑定回环地址。Basic Auth 必须与 HTTPS 一起使用。

## 备份与升级

升级前执行：

```bash
npm run backup:data -- before-upgrade
```

至少定期异地复制 `data/`。升级时只更新代码和容器镜像，不要删除或覆盖个人数据目录。

