# Dograh 本地 Docker 部署指南（Windows）

本文档整理自实际操作流程，适用于通过 Git 拉取源码后，在 Windows 上使用 Docker 本地启动 Dograh。

---

## 一、环境准备

### 1. 系统要求
- Windows 10/11（推荐使用 WSL2）
- Docker Desktop 已安装并启动
- 建议资源：内存 ≥ 8GB，CPU ≥ 2 核，磁盘 ≥ 10GB

### 2. 必要软件
- Git
- Docker Desktop（包含 Docker Compose）
- PowerShell（Windows 自带）

---

## 二、获取代码

```powershell
# 克隆官方仓库
git clone https://github.com/dograh-hq/dograh.git
cd dograh
```

> 如果已经克隆过，直接进入项目目录即可。

---

## 三、下载启动脚本

官方提供了专门的 PowerShell 启动脚本，建议使用：

```powershell
curl -o scripts/start_docker.ps1 https://raw.githubusercontent.com/dograh-hq/dograh/main/scripts/start_docker.ps1
```

如果 `curl` 下载失败（网络问题），可用浏览器打开下面链接，手动另存为 `scripts/start_docker.ps1`：

https://raw.githubusercontent.com/dograh-hq/dograh/main/scripts/start_docker.ps1

---

## 四、启动项目

### 方式一：使用官方脚本（推荐）

```powershell
# 允许当前会话执行脚本
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# 运行启动脚本
.\scripts\start_docker.ps1
```

脚本会自动：
- 生成 `.env` 文件（包含 JWT、数据库、Redis、MinIO 等密钥）
- 提示确认后启动所有服务

按提示输入 `Y` 即可。

### 方式二：手动启动（绕过脚本）

如果脚本报错（例如 volume 检查问题），可直接执行：

```powershell
$env:REGISTRY = 'ghcr.io/dograh-hq'
$env:ENABLE_TELEMETRY = 'true'
docker compose --profile tunnel up --pull always
```

---

## 五、访问应用

启动成功后（首次大约需要 2~3 分钟拉取镜像），浏览器打开：

**http://localhost:3010**

即可开始创建账号和语音 Agent。

---

## 六、常用命令

```powershell
# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f

# 停止服务
docker compose --profile tunnel down

# 停止并删除数据卷（彻底清理）
docker compose --profile tunnel down -v

# 重新启动
docker compose --profile tunnel up -d
```

---

## 七、修改代码后重新构建

如果你修改了项目代码，需要本地构建镜像才能生效：

```powershell
# 1. 创建 override 文件（让 compose 使用本地构建）
@'
services:
  api:
    image: dograh-api:local
    build:
      context: .
      dockerfile: api/Dockerfile
  ui:
    image: dograh-ui:local
    build:
      context: .
      dockerfile: ui/Dockerfile
'@ | Set-Content docker-compose.override.yaml -Encoding utf8

# 2. 重新构建并启动
docker compose --profile tunnel up -d --build
```

之后每次修改代码，只需执行：

```powershell
docker compose --profile tunnel up -d --build
```

---

## 八、可选配置

### 关闭遥测
```powershell
$env:ENABLE_TELEMETRY = 'false'
docker compose --profile tunnel up --pull always
```

### 关闭公开注册（创建第一个账号后）
在 `.env` 文件中添加或修改：

```
ENABLE_SIGNUP=false
```

然后重新运行启动命令（`docker compose restart` 不会重新加载 `.env`）。

### 使用 Docker Hub 镜像源
```powershell
$env:REGISTRY = 'dograhai'
```

---

## 九、常见问题

| 问题 | 解决方案 |
|------|----------|
| `Connection was reset` | GitHub 网络不稳定，改用浏览器手动下载文件 |
| `$'\r': command not found` | 使用 `.ps1` 脚本，不要用 bash 跑 `.sh` |
| `no such volume` | 直接执行 `docker compose --profile tunnel up --pull always` |
| 端口被占用 | 检查 3010、8000、5432、6379、9000 端口是否空闲 |
| WebRTC 无声音 | 使用带 coturn 的配置（参考官方文档） |

---

## 十、参考链接

- 官方文档：https://docs.dograh.com
- Docker 部署说明：https://docs.dograh.com/deployment/docker
- GitHub 仓库：https://github.com/dograh-hq/dograh
```