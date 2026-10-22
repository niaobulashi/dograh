# Dograh API Key 存储机制与「恢复/解密」说明

> 结论先行：**数据库里存的是 SHA-256 单向哈希，不是加密。无法从 `key_hash` 反推出原始 API key。**
> 原始 key 只在「创建那一刻」返回过一次。本仓库提供 `scripts/verify_api_key.py` 用于**校验**一个候选 key 是否正确。

---

## 1. 原始 API key 是怎么生成的（源码：`api/utils/api_key.py`）

```python
raw_api_key = f"dgr_{secrets.token_urlsafe(32)}"            # 原始 key
key_hash    = hashlib.sha256(raw_api_key.encode()).hexdigest()  # 入库的只是哈希
key_prefix  = raw_api_key[:8]                               # 展示用前缀
```

- 原始 key 格式：`dgr_` + `secrets.token_urlsafe(32)`，总长 **47 字符**。
- `key_hash` 是 **SHA-256 摘要**，**单向、不可逆**——不存在对应的「解密」算法。
- `key_prefix`（本例 `dgr_Pecf`）只是原始 key 的前 8 位：它证明原始 key **以 `dgr_Pecf` 开头**，但后面 39 位完全随机、无法反推。

## 2. 数据库里到底存了什么（`api/db/models.py` → `APIKeyModel`）

| 字段 | 含义 | 是否含明文 |
|------|------|-----------|
| `key_hash` | `sha256(raw_api_key)` | 否（哈希） |
| `key_prefix` | 原始 key 前 8 位 | 否（仅前缀） |
| `name` / `is_active` / `created_at` 等 | 元数据 | — |

> 没有任何字段保存明文。校验逻辑 `validate_api_key`（`api/db/api_key_client.py`）也是
> 对传入的 key 算 SHA-256 再与 `key_hash` 比对——同样是「单向验证」，而非解密。

## 3. 为什么无法「解密」还原

SHA-256 是密码学哈希函数，设计上不可逆。本例已知：
- `key_hash = 081294f30e5da4d390343cd449cbb4ab5931346ba4e036799e991ec2c48ad780`
- `key_prefix = dgr_Pecf`（仅前 8 位已知）

即使暴力枚举 `dgr_` 之后 39 位的组合，空间约为 `64^39 ≈ 2^234`，在物理上不可行。

## 4. 如何找回原始 key（按可行性排序）

1. **从创建记录里找**（唯一能拿到明文的地方）：
   - `POST /api-keys` 的响应体 `api_key` 字段（创建成功时一次性返回，之后接口再也不返回）。
   - 前端创建成功弹窗 / 当时保存的笔记 / 接口调试工具（浏览器 Network、Postman 历史、curl 日志）。
2. **重新生成一个新 key**（推荐、干净）：
   ```bash
   curl -X POST "http://localhost:8000/api/v1/user/api-keys" \
     -H "Authorization: Bearer <你的JWT>" \
     -H "Content-Type: application/json" \
     -d '{"name":"Default API Key"}'
   ```
   响应里的 `api_key` 字段就是新的明文 key，旧 key 同时作废。
3. **不要把时间浪费在「解密」上**——数据库里没有、也还原不出明文。

## 5. 如何校验一个「疑似原始 key」

当你从某处抠出一段疑似字符串，用脚本确认它是否就是 `dgr_Pecf…` 那条：

```bash
# 与 id=1 记录的已知哈希比对
python scripts/verify_api_key.py dgr_PecfXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# 覆盖目标哈希（例如你要核对别的记录）
TARGET_KEY_HASH=081294f30e5da4d390343cd449cbb4ab5931346ba4e036799e991ec2c48ad780 \
  python scripts/verify_api_key.py <候选key>

# 直接连库：给定候选 key，查全表是否命中任意一条（需 DATABASE_URL 或 POSTGRES_* 环境变量）
python scripts/verify_api_key.py --db <候选key>
```

输出会告诉你：
- 前缀是否匹配（快速排除）；
- 候选 key 的 SHA-256 是否与 `key_hash` 一致（最终判定）。

## 6. 红线

- ❌ **不要尝试暴力破解** `key_hash`：2^234 量级，物理不可行。
- ❌ **不要改动哈希算法**或修改 `key_hash` 去「伪造」一条记录——会导致所有用旧 key 的客户端 401。
- ❌ **不要把 `key_hash` 当加密字段处理**：它本来就不是，任何「加解密」思路在源码层面都不成立。
- ✅ 丢了就重新生成 key，是设计上的预期路径。
