# Dograh 代码改动后重建镜像与启动

## 最常用：改前端

```powershell
docker compose build ui
docker compose --profile tunnel up -d

或者 
docker compose --profile tunnel up -d --build ui


```

前提是已经建好 `docker-compose.override.yaml`（见文末「首次准备」）。

---

## 改后端

```powershell
docker compose build api
docker compose --profile tunnel up -d

或者 
docker compose --profile tunnel up -d --build api
```

## 前后端都改

```powershell
docker compose build
docker compose up -d
```

## 怀疑改动没进去，清缓存重建

```powershell
docker compose build --no-cache ui
docker compose up -d ui
```

---

## 验证

```powershell
docker compose ps
docker compose logs -f ui
curl.exe -s http://localhost:3010/auth/login | Select-String 'html lang'
```

`docker compose ps` 的 `IMAGE` 列应为 `dograh-ui:local`。

---

## 首次准备：override 文件

项目根目录 `E:\workspace\my\dograh` 下新建 `docker-compose.override.yaml`，按需选一个：

**只改前端**：

```powershell
@'
services:
  ui:
    image: dograh-ui:local
    build:
      context: .
      dockerfile: ui/Dockerfile
'@ | Set-Content docker-compose.override.yaml -Encoding utf8
```

**只改后端**：

```powershell
@'
services:
  api:
    image: dograh-api:local
    build:
      context: .
      dockerfile: api/Dockerfile
'@ | Set-Content docker-compose.override.yaml -Encoding utf8
```

**前后端都改**：

```powershell
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
```

校验：

```powershell
docker compose config
```

---

## 红线

- **禁止 `docker compose down -v`**，会删数据卷（账号、Agent 配置、录音全丢）。
- 清磁盘用 `docker builder prune`，不要用 `docker system prune -a --volumes`。
- 新增前端顶层目录（如 `messages/`），必须在 `ui/Dockerfile` 的 builder 阶段加一行 `COPY ui/<目录> ./<目录>`；`api/Dockerfile` 同理。
- 不用先删旧镜像，重建会自动覆盖 tag。
- 前端首次构建约 15 分钟，属正常。
