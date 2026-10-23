# vendor_voices 表初始化与试听音频转存 操作文档

## 结论先行

1. **首次部署表会自动建**，但**数据不会自动初始化**。
   - 建表：`api/alembic/versions/f2c4a9e1b7d3_vendor_voices.py` 这一迁移在容器启动时由 `scripts/start_services_docker.sh`（本地 docker-compose）或 Helm 的 migrate-job 执行 `alembic upgrade heads` 跑过，**表结构会自动创建**。
   - 数据：该迁移**只有 `create_table`，没有任何 `insert`**。数据来源是 `scripts/minimax_voices.json`，必须由 `scripts/sync_minimax_voices.py` **手动导入一次**。项目里没有自动 seed 逻辑（已确认 `start_services_docker.sh` / `run_migrate.sh` / `alembic/env.py` 均无 seed 调用）。
2. **试听音频新增字段 `preview_audio_url`（本地 MinIO 镜像）**，需执行新增迁移 + 转存脚本。

---

## 一、`vendor_voices` 数据初始化（首次部署必做）

表已随迁移自动建好，但行数据为空。首次部署后手动跑一次同步脚本：

```bash
# 进入 api 容器（容器 WORKDIR=/app，sync 脚本 + json 已随镜像拷入 /app/scripts；
# 前提是用了含本变更的 api/Dockerfile 重建镜像，否则需手动 docker cp 这两个文件进容器）
docker compose exec api python scripts/sync_minimax_voices.py --json scripts/minimax_voices.json
```

> 容器外直接跑也可，但要保证 `DATABASE_URL` 等环境变量已加载（项目约定：`set -a && source api/.env && set +a`）。

**验证**（任选其一）：

```bash
# SQL
docker compose exec postgres psql -U postgres -d postgres \
  -c "select count(*) from vendor_voices where provider='minimax';"

# 或 Python
docker compose exec api python -c \
  "from api.db import db_client; import asyncio; print(len(asyncio.run(db_client.list_vendor_voices('minimax'))))"
```

**红线 / 注意**：
- 该脚本是**全量刷新**：先 `delete` 再 `insert` 该 provider 全部行，重复跑幂等，不会重复累加。
- `minimax_voices.json` 是离线快照（600 条，1.4MB），如需最新列表用 `--fetch`（需 `MINIMAX_WEB_TOKEN`，见脚本头注释）。

---

## 二、应用本变更（新增 `preview_audio_url` 字段）

本变更含一个 alembic 迁移：`c1d2e3f4a5b6_vendor_voices_preview_audio_url.py`（在 `f2c4a9e1b7d3` 之后加列）。

⚠️ **多 head 注意**：仓库 alembic 当前存在多个 head（上游分支头 `f2e1d0c9b8a7` + 本变更 `c1d2e3f4a5b6`）。启动脚本 `scripts/start_services_docker.sh` 与 `scripts/run_migrate.sh` 已由 `alembic upgrade head`（**单数，多 head 下会报 `Multiple head revisions are present` 并中断容器启动**）改为 `alembic upgrade heads`（**复数**），所以 `docker compose up` 启动时会自动应用本迁移，无需手动再跑。如手动应用，可用：

```bash
# 推荐：应用所有 head（含本分支）
docker compose exec api alembic upgrade heads

# 或：只应用本迁移
docker compose exec api alembic upgrade c1d2e3f4a5b6
```

**验证**：

```bash
docker compose exec postgres psql -U postgres -d postgres \
  -c "\d vendor_voices"   # 确认出现 preview_audio_url 列
```

---

## 三、试听 mp3 转存到本地 MinIO

字段语义：
- `preview_url`：厂商 CDN 外链（如 `hailuoai.com` 的 `.mp3`），原始来源。
- `preview_audio_url`：把外链 mp3 下载后存入本地 MinIO 的**公开 URL**。API 优先返回它，避免依赖外网/被限流/链接过期。

前提：`.env` 已配 MinIO（`MINIO_ENDPOINT` / `MINIO_BUCKET` 默认 `voice-audio` / `MINIO_PUBLIC_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`）。`MinioFileSystem` 初始化时会把该 bucket 设为匿名可读（本地开发），所以写入后公开 URL 可直接浏览器播放。

执行转存：

```bash
# 只处理 preview_audio_url 为空的行
docker compose exec api python scripts/transfer_vendor_voices_previews.py

# 重转全部（即使已有本地副本）：加 --force
docker compose exec api python scripts/transfer_vendor_voices_previews.py --force

# 调试：只列待处理、不下载：--dry-run；限量：--limit N
docker compose exec api python scripts/transfer_vendor_voices_previews.py --dry-run --limit 5
```

**验证**：

```bash
docker compose exec postgres psql -U postgres -d postgres -c \
  "select voice_id, preview_audio_url from vendor_voices where provider='minimax' and preview_audio_url is not null limit 5;"

# 浏览器打开 preview_audio_url，应能直接播放，形如：
# http://localhost:9000/voice-audio/vendor-voices/minimax/<voice_id>.mp3
```

**重跑 / 重置**：

```bash
# 清空本地副本标记后重新转存
docker compose exec postgres psql -U postgres -d postgres -c \
  "update vendor_voices set preview_audio_url=null where provider='minimax';"
docker compose exec api python scripts/transfer_vendor_voices_previews.py --force
```

**红线**：转存脚本已对 `ENVIRONMENT==test` 拒绝执行，不要在测试库跑（会往测试 MinIO 写 600 个文件）。

---

## 四、改动清单（带文件路径）

| 类型 | 文件 | 说明 |
|------|------|------|
| 新增 | `api/alembic/versions/c1d2e3f4a5b6_vendor_voices_preview_audio_url.py` | 新增 `preview_audio_url` 列迁移 |
| 改 | `api/db/models.py`（`VendorVoiceModel`） | 增加 `preview_audio_url = Column(Text, nullable=True)` |
| 改 | `api/db/vendor_voice_client.py` | `VendorVoiceItem` / `upsert_vendor_voices` / `_load_all` 透传该字段 |
| 改 | `api/services/configuration/voice_catalog_adapters.py` | `MiniMaxVoiceCatalog.voices()` 优先返回 `preview_audio_url or preview_url` |
| 新增 | `scripts/transfer_vendor_voices_previews.py` | 外链 mp3 下载 → 本地 MinIO → 回写 `preview_audio_url` |
| 改 | `scripts/start_services_docker.sh` | `alembic upgrade head` → `upgrade heads`（仓库多 head，`set -e` 下单数会中断容器启动） |
| 改 | `scripts/run_migrate.sh` | 同上 |
| 改 | `api/Dockerfile` | COPY 列表显式加入 `scripts/sync_minimax_voices.py` / `scripts/transfer_vendor_voices_previews.py` / `scripts/minimax_voices.json`（原来只点名 7 个 `.sh`，目录里其他文件不会进镜像，导致 `exec` 报文件不存在） |

> 注：`scripts/sync_minimax_voices.py` 只写 `preview_url`（厂商外链），不写 `preview_audio_url`；本地镜像由上面的转存脚本负责，二者职责分离。
