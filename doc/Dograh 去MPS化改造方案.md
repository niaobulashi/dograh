# Dograh 去 MPS 化改造方案

> 目标：不再依赖 `https://services.dograh.com`（MPS），LLM/STT/TTS/Embedding/音色目录全部换成自建或第三方（阿里、腾讯、火山、MiniMax 等），知识库分片本地实现。
>
> 适用范围：本文档基于当前仓库代码（`api/`、`pipecat/` 子模块）实测路径，行号可能随上游 rebase 漂移，改造前请以 `grep` 结果为准。

---

## 0. 结论先看

| # | 能力 | 现状 | 能否零代码切换 | 推荐方案 |
|---|---|---|---|---|
| 1 | LLM | 托管走 `{MPS}/api/v1/llm` | **能**（选 OpenAI provider + 改 base_url） | DeepSeek / 阿里 compatible-mode / 火山 Ark |
| 2 | Embedding | 托管走 `{MPS}/api/v1/llm`（embeddings） | **不能**，`OpenAIEmbeddingsConfiguration` 缺 `base_url` 字段，补 1 行即可 | 阿里 `text-embedding-v3` / 火山 `doubao-embedding` |
| 3 | STT | 托管走 `wss://services.dograh.com` | **不能**，必须新增 provider | 火山大模型流式 / 阿里 Paraformer / 腾讯实时 ASR |
| 4 | TTS | 托管走 `wss://services.dograh.com` | **MiniMax 已零代码**；其他需新增 provider | 先 MiniMax 顶上，再补火山/阿里/腾讯 |
| 5 | 音色目录 | 托管走 `/api/v1/voice-proxy/{provider}/voices` | 部分能（已有 5 家 adapter） | 新增 `VOICE_CATALOGS` 条目 |
| 6 | 文档解析+分片 | 托管走 `/api/v1/document/process`（Docling） | **不能**，需本地实现 | 本地 docling / unstructured + tiktoken 分块 |
| 7 | RAG 检索 | **已经是本地 pgvector**，不依赖 MPS | 不用改 | 保持 |
| 8 | 组织引导自动建 key + SIP | 托管 `/api/v1/service-keys/`、`/cloudonix/domains/self` | 需关闭 | 关掉或替换 |
| 9 | 录音转写 | 托管 `/api/v1/stt/transcribe` | 需改 | 复用新的 STT provider |
| 10 | 工作流模板生成 | 已本地化 DeepSeek | 已完成 | 保持 `WORKFLOW_TEMPLATE_GENERATOR=local` |

**关键认知**：RAG 的 embedding 生成和 pgvector 相似度检索本来就是本地做的，真正外包给 MPS 的只有「文件 → 文本 → 分块」这一步。所以 #6 的改造量比想象中小。

---

## 1. MPS 依赖地图

| 功能 | 调用点 | 端点 |
|---|---|---|
| 文档解析/分块 | `api/tasks/knowledge_base_processing.py:177` | `POST /api/v1/document/process` |
| 录音转写 | `api/routes/workflow_recording.py:323,331` | `POST /api/v1/stt/transcribe` |
| 组织引导建 key | `api/services/organization_bootstrap.py:166` | `POST /api/v1/service-keys/` |
| 托管 SIP | `api/services/telephony/providers/cloudonix/provisioning.py:56` | `PUT /api/v1/cloudonix/domains/self` |
| LLM | `api/services/pipecat/service_factory.py:1451` | `POST /api/v1/llm` |
| STT | `service_factory.py:654`、`pipecat/services/dograh/stt.py:70` | `wss://services.dograh.com` |
| TTS | `service_factory.py:1002`、`pipecat/services/dograh/tts.py:99` | `wss://services.dograh.com` |
| Embedding | `api/services/configuration/ai_model_configuration.py:78` | `{MPS}/api/v1/llm` + `/embeddings` |
| 音色目录 | `api/routes/user.py:411` | `GET /api/v1/voice-proxy/{provider}/voices` |
| 密钥校验 | `api/services/configuration/check_validity.py:412` | `GET /api/v1/service-keys/usage/self` |
| 通话前鉴权 | `api/services/quota_service.py:326,426,484,530` | `/billing/accounts/{org}/run-authorization`、`/service-keys/*` |
| 用量上报 | `api/services/workflow_run_billing.py:83` | `POST /billing/accounts/{org}/platform-usage` |
| 账单 | `api/routes/organization_usage.py:215,288,404` | `/billing/*` |
| 模板生成 | `api/routes/workflow.py:613,624` | `POST /api/v1/workflow/create-workflow` |

---

## 2. 逐项改造

### 2.1 LLM → DeepSeek（零代码）

界面上 **Model Configurations → LLM** 选 `OpenAI`，填：

| 字段 | 值 |
|---|---|
| API Key | `sk-...`（DeepSeek 控制台） |
| Model | `deepseek-chat` / `deepseek-reasoner` |
| Base URL | `https://api.deepseek.com/v1` |

依据：`api/services/configuration/registry.py:543` 的 `OpenAILLMService` 带 `base_url` 字段，`service_factory.py:1451` 只有 `provider == dograh` 才走 MPS。

阿里/火山同理（都是 OpenAI 兼容）：

| 供应商 | Base URL | 备注 |
|---|---|---|
| 阿里百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | qwen 系列 |
| 火山方舟 | `https://ark.cn-beijing.volces.com/api/v3` | 模型填接入点 ID 或 `doubao-...` |
| MiniMax | `https://api.minimax.io/v1` | 也可用原生 provider `minimax`（`registry.py:799`） |
| DeepSeek | `https://api.deepseek.com/v1` | — |

> 想让界面显示 "DeepSeek" 而不是 "OpenAI"：`pipecat/src/pipecat/services/deepseek/llm.py` 已有实现，但没有注册到 api 侧。注册一个 `DEEPSEEK_PROVIDER`（见 2.3 的三处必改）即可，非必需。

---

### 2.2 Embedding → 阿里/火山（需补 1 个字段）

**问题**：`registry.py:2491` 的 `OpenAIEmbeddingsConfiguration` 没有 `base_url`，UI 上填不了第三方网关（而 `service_factory`/`openai_service.py` 是支持 `base_url` 参数的）。

**改法**（最小 diff）：

```python
# api/services/configuration/registry.py:2491
@register_embeddings(provider=OPENAI_PROVIDER)
class OpenAIEmbeddingsConfiguration(BaseEmbeddingsConfiguration):
    provider: Literal[ServiceProviders.OPENAI] = ServiceProviders.OPENAI
    model: str = Field(default="text-embedding-3-small", ...)
    base_url: str = Field(                       # 新增
        default="https://api.openai.com/v1",
        description="Override for OpenAI-compatible embedding APIs.",
    )
```

`factory.py:build_embedding_service` 已经把 `base_url` 透传给 `OpenAIEmbeddingService`，无需改其他代码。

**红线：向量维度**

`api/db/models.py:1565` 是 `Vector(1536)` 硬编码，`openai_service.py:19` 也写死 `EMBEDDING_DIMENSION = 1536`。

| 供应商模型 | 原生维度 | 处理方式 |
|---|---|---|
| OpenAI `text-embedding-3-small` | 1536 | 直接可用 |
| 阿里 `text-embedding-v3` | 1024（可指定 1024/768/512） | 需在客户端补零/PCA 到 1536，或改列维度 |
| 火山 `doubao-embedding-large` | 2048 / 1024 / 512 | 同上 |
| 阿里 `text-embedding-v4` | 支持 1536 | **优先选这个，零改动** |

改列维度的代价：`Vector(1536)` → 目标维度 → 生成 alembic 迁移 → **删除并重建 IVFFlat 索引**（`models.py:1590`）→ 全量重新 ingest 知识库。老 chunk 的 `embedding_model` 字段不同，`search_similar_chunks(embedding_model=...)` 会过滤掉，不会污染检索结果。

---

### 2.3 STT → 火山/阿里/腾讯（必须新增 provider）

现有 `create_stt_service`（`service_factory.py:551`）是 `elif user_config.stt.provider == ...` 硬分支，没有通用 HTTP/WS provider 可用，必须新增。**三处必改 + 一处建议改**：

1. `ServiceProviders` 枚举（`registry.py:90`）
2. `BaseServiceConfiguration.provider` 的 `Literal[...]` 白名单（`registry.py:165` 起）——**漏了会 500，最容易忘**
3. `@register_stt` 配置类（`registry.py:2096` 附近）
4. `create_stt_service` 分支（`service_factory.py:551`）

骨架（以火山大模型流式为例）：

```python
# --- registry.py ---
class ServiceProviders(str, Enum):
    ...
    VOLCENGINE = "volcengine"

VOLCENGINE_PROVIDER = Provider("volcengine", "火山引擎")

@register_stt(provider=VOLCENGINE_PROVIDER)
class VolcengineSTTConfiguration(BaseSTTConfiguration):
    provider: Literal[ServiceProviders.VOLCENGINE] = ServiceProviders.VOLCENGINE
    api_key: str = Field(description="app_id:access_token", json_schema_extra={"multiline": True})
    model: str = Field(default="bigmodel", json_schema_extra={"examples": ["bigmodel"]})
    language: str = Field(default="zh-CN")
    base_url: str = Field(default="wss://openspeech.bytedance.com/api/v3/sauc/bigmodel")
```

```python
# --- service_factory.py: create_stt_service() ---
elif user_config.stt.provider == ServiceProviders.VOLCENGINE.value:
    return VolcengineSTTService(
        api_key=user_config.stt.api_key,
        base_url=user_config.stt.base_url,
        sample_rate=audio_config.transport_in_sample_rate,
        should_interrupt=False,   # 与现有 provider 保持一致，中断交给 UserAggregator
    )
```

STT 适配的真正难点不是协议，是 **turn detection**：

- 托管 Dograh STT 跑的是 Deepgram Flux 多语种，自带 EOT（end-of-turn）判断，`service_factory.py:654` 的 `eot_timeout_ms/eot_threshold` 就是调这个。
- 换火山/阿里/腾讯的流式 ASR，只吐中间结果，**没有 turn 概念**。要么依赖 pipeline 里已有的 VAD 收尾（检查 `pipecat` 的 `VADProcessor` 是否在你选的 transport 链路里启用），要么在返回的 `TranscriptionFrame` 上补 `finalize`（部分厂商有 `definite` 字段，可映射）。
- 如果没有 turn detection，机器人会出现「用户停顿 0.5 秒就被抢话」。这是换 STT 最容易踩的坑。

各家接入点（以官方文档为准）：

| 供应商 | 协议 | 端点 |
|---|---|---|
| 火山 大模型流式 | WS 二进制 | `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel` |
| 阿里 Paraformer 实时 | WS JSON | `wss://dashscope.aliyuncs.com/api-ws/v1/inference` |
| 腾讯 实时语音识别 | WS | `wss://asr.cloud.tencent.com/asr/v2/{appid}?{签名参数}` |
| MiniMax | 无独立 ASR | — |

> `pipecat/src/pipecat/services/` 里已有 `funasr`、`whisper`、`speaches`、`assemblyai`、`gladia`、`soniox` 等现成 STT 实现，抄一个结构最省事（推荐抄 `soniox` 或 `assemblyai`，都是「WS + 中间结果」范式）。

**低成本过渡方案**：先上 `whisper` 本地部署（`speaches` provider 就是 OpenAI 兼容的自建推理服务，`registry.py:446` 已注册），零 MPS 依赖，代价是延迟比流式高 300~800ms。

---

### 2.4 TTS → MiniMax 先顶上，再补国内厂商

**好消息：MiniMax TTS 已经完全接好，不碰 MPS。**

- 配置类：`registry.py:1727` `@register_tts(provider=MINIMAX_PROVIDER)`
- 工厂分支：`service_factory.py` 的 MiniMax 分支 + `api/services/pipecat/minimax_tts.py`
- 默认端点：`https://api.minimax.io/v1/t2a_v2`，国内站改 `https://api.minimaxi.chat/v1/t2a_v2`
- 音色：`MINIMAX_TTS_VOICES`（`registry.py:1717`）内置列表，可直接下拉选

所以 TTS 的优先级应该是：**MiniMax（零代码）→ 火山/阿里/腾讯（按 2.3 的同一套骨架新增 provider）**。

其他厂商接入点：

| 供应商 | 协议 | 端点 |
|---|---|---|
| 火山 TTS | WS 二进制 | `wss://openspeech.bytedance.com/api/v1/tts/ws_binary` |
| 阿里 CosyVoice | WS JSON | `wss://dashscope.aliyuncs.com/api-ws/v1/inference` |
| 腾讯 TTS 流式 | WS | `wss://tts.cloud.tencent.com/stream_ws` |

注意 TTS 的两个隐性要求，新增 provider 时必须满足，否则体验崩：

1. **流式首包**：必须支持边合成边播（chunk 级 PCM），不能等整句合成完。否则首字延迟从 300ms 涨到 2s。
2. **PCM 格式 + 采样率**：pipeline 内部统一 PCM16，`audio_config.transport_out_sample_rate` 为准。厂商若只给 MP3/OGG，需在 service 里转码，或在 `text_filters` 之外加一层重采样（`pipecat` 有 `audio_resampler`）。

一次性 HTTP 合成（非流式）也能接，但要配合 `tts_cache`（`api/services/pipecat/tts_cache/`，现有 MiniMax 在用）缓存固定话术（开场白、兜底话术），否则长回复首字延迟不可接受。

---

### 2.5 音色目录（留口子）

现有机制已经是一个干净的插件点，不需要改路由：

```
api/services/configuration/voice_catalog_adapters.py
  VOICE_CATALOGS = {elevenlabs, cartesia, deepgram, rime, sarvam}   # :311
```

新增一个厂商 = 加一个 `VoiceCatalog` 子类 + 注册一行：

```python
class VolcengineVoiceCatalog(VoiceCatalog):
    name = "火山引擎"
    base_url = "https://openspeech.bytedance.com"
    path = "/api/v1/tts/voices"          # 以实际接口为准
    auth_header = "Authorization"
    auth_prefix = "Bearer "

    async def voices(self, client, query: VoiceQuery) -> list[VoiceInfo]:
        resp = await client.get(self.url, headers=self.headers, params=...)
        data = resp.json()
        return [VoiceInfo(id=v["id"], name=v["name"], ...) for v in data["voices"]]

VOICE_CATALOGS["volcengine"] = VolcengineVoiceCatalog
```

路由 `api/routes/user.py:376` 已经按 `provider` 分发，前端 UI 自动可用（走「已保存的 provider 连接」这条链路，`voice_catalog.py:19`）。

**如果你的厂商没有「列音色」接口**（腾讯 TTS 就是给固定 voice_type 列表，火山也基本是控制台配置）：不必硬做 adapter，直接把音色列表写进 `registry.py` 的 `Field(json_schema_extra={"examples": [...], "allow_custom_input": True})`，UI 就变成一个下拉 + 可手填，效果一样。

---

### 2.6 知识库分片 → 本地实现

现状：`knowledge_base_processing.py` 只做「下载 → 喂 MPS → 拿 chunks → 本地 embedding → 写 pgvector」。要本地化的是 `:177` 那一次调用。

MPS 返回的结构（`mps_service_key_client.py:890` 注释）：

```json
{
  "mode": "chunked",
  "docling_metadata": {...},
  "full_text": null,
  "chunks": [{"text": "...", "meta": {...}, "contextualized_text": "..."}]
}
```

本地替换只需产出同构 dict，下游 embedding/入库代码一行不用改。

推荐实现（按文件类型分流）：

| 文件类型 | 方案 | 依赖 |
|---|---|---|
| PDF（含扫描件） | docling（本地库，和 MPS 同源，质量最接近） | `docling` |
| PDF（纯文本） | pymupdf4llm → markdown | `pymupdf4llm` |
| DOCX/PPTX/XLSX | python-docx / python-pptx / openpyxl | 已有生态 |
| HTML/MD/TXT | markdown-it / 直接读 | — |
| 扫描件 OCR | paddleocr / tesseract | 体积大，按需 |

分块策略（`max_tokens=128` 是当前默认，偏小，本地可以放宽）：

```python
# api/services/knowledge_base/local_chunker.py（新建）
import tiktoken

def chunk_text(text: str, max_tokens: int = 128, overlap: int = 0,
               tokenizer_model: str = "cl100k_base") -> list[dict]:
    enc = tiktoken.get_encoding(tokenizer_model)
    ids = enc.encode(text)
    chunks, i = [], 0
    while i < len(ids):
        window = ids[i : i + max_tokens]
        chunks.append({
            "text": enc.decode(window),
            "meta": {"start_token": i, "end_token": i + len(window)},
        })
        i += max_tokens - overlap
    return chunks
```

接入点：

```python
# api/tasks/knowledge_base_processing.py:177
if DOCUMENT_PROCESSOR == "local":
    mps_response = {
        "mode": retrieval_mode,
        "docling_metadata": {"processor": "local"},
        "full_text": full_text if retrieval_mode == "full_document" else None,
        "chunks": [] if retrieval_mode == "full_document"
                  else chunk_text(full_text, max_tokens, chunk_overlap_tokens),
    }
else:
    mps_response = await mps_service_key_client.process_document(...)
```

**分块质量要点**（不是照抄按字符切就行）：

1. 有结构的文档按标题切，再按 token 上限截断（docling 的 `HybridChunker` 就是这个思路）。
2. `contextualized_text` 字段：MPS 会做「上下文增强」（给 chunk 补上所属章节标题/文档名），本地实现建议拼 `"{文档标题} > {章节} \n {chunk}"`，否则 RAG 召回准确率会明显下降——这是本地分片最容易忽略的一点。
3. `max_tokens=128` 对中文约等于 100 字，太碎；本地建议 400~512 token（约 300~400 汉字）。

---

### 2.7 RAG 检索（无需改动）

`api/db/knowledge_base_client.py:355` `search_similar_chunks` 是纯 SQL + pgvector `<=>` 余弦相似度，本地执行。调用点：

- 手动检索：`api/routes/knowledge_base.py:522`
- Agent 运行时 RAG 召回：`api/services/workflow/tools/knowledge_base.py:281`

想升级检索质量也不碰 MPS，本地加即可：`tsvector` 全文 + `pg_trgm` 子串（中文数字/专有名词），再用 RRF 融合（BM25 权重 + 向量权重），在 `search_similar_chunks` 外层做 rerank。

---

### 2.8 三个「隐性 MPS 依赖」的处置

这三处不处理，即使模型全换成本地，注册账号仍会打 MPS。

**① 组织引导自动写托管配置**（`organization_bootstrap.py:160-185`）

新组织 bootstrap 时会：
1. 调 `ensure_hosted_mps_billing_account_v2`（已 best-effort，失败只 warning）
2. `mint_managed_service_key()` → 打 MPS 建 service key
3. `bootstrap_default_model_configuration(provider="dograh")` → **把默认模型配置写成 provider=dograh**
4. `provision_managed_sip_connectivity()` → 打 MPS 开 Cloudonix 域名

处置：让 `_bootstrap_organization` 在 `DEPLOYMENT_MODE == "oss"` 且配置了 `SKIP_MANAGED_PROVISIONING=1` 时直接 return True，跳过 2/3/4，默认模型配置改为写你自己的 DeepSeek/阿里配置（或者干脆不写，让用户自己选）。

> 注意：不跳过 #3 的话，即便你手动选了 DeepSeek，新用户仍会默认创建一份 `dograh` 配置，`quota_service` 检测到 dograh key 就会去打 MPS 鉴权。

**② 托管 SIP**

`provision_managed_sip_connectivity` 走 MPS 的 Cloudonix。国产化替代：
- 自建 Asterisk/FreeSWITCH + ARI（`api/services/telephony/providers/ari/` 已有实现）
- 或接阿里云通信/腾讯云 TRTC 的 SIP 网关，写成新的 telephony provider（`api/services/telephony/providers/` 下已有 plivo/telnyx/exotel/cloudonix 可抄）
- 只用网页 WebRTC 测试的话，直接跳过，不需要 SIP

**③ 录音转写**（`workflow_recording.py:323`）

这里是「上传音频文件 → 文本」的一次性转写，不是实时链路。改造：把 `mps_service_key_client.transcribe_audio` 换成你新 STT provider 的非流式接口（火山 `submit/flush`、阿里 `recognition` 一句话、腾讯录音文件识别都是 HTTP 轮询），接口形态差异不大。

---

## 3. 分阶段实施清单

| 阶段 | 改动 | 文件 | 类型 | 预估 |
|---|---|---|---|---|
| P0 | LLM 换 DeepSeek | 无（UI 配置） | 配置 | 10 分钟 |
| P0 | TTS 换 MiniMax | 无（UI 配置） | 配置 | 10 分钟 |
| P0 | 关掉模板生成走 MPS | `.env`：`WORKFLOW_TEMPLATE_GENERATOR=local` | 配置 | 已完成 |
| P1 | 关组织引导托管逻辑 | `api/services/organization_bootstrap.py:160-185` | 改代码 | 0.5 天 |
| P1 | Embedding 加 `base_url` | `api/services/configuration/registry.py:2491` | +4 行 | 10 分钟 |
| P1 | 本地分片替换 | 新建 `api/services/knowledge_base/local_chunker.py`；改 `api/tasks/knowledge_base_processing.py:177` | 新文件 + 分支 | 1~2 天 |
| P2 | STT 新增 provider | registry 三处 + `service_factory.py:551` + 新建 `pipecat/services/<vendor>/stt.py` | 新文件 + 分支 | 2~3 天/家 |
| P2 | TTS 新增 provider | registry 三处 + `service_factory.py:817` + 新 service 类 | 新文件 + 分支 | 2~3 天/家 |
| P2 | 音色目录 | `voice_catalog_adapters.py:311` | +1 类 | 0.5 天/家 |
| P3 | 录音转写换源 | `api/routes/workflow_recording.py:313` | 改调用 | 0.5 天 |
| P3 | SIP 替换/禁用 | `organization_bootstrap.py:184`、`telephony/providers/` | 视方案 | 3~5 天 |

**建议顺序**：P0 先切 LLM + TTS（立刻能跑通对话），P1 断掉 MPS 的隐性调用（注册/分片），P2 再补 STT（最难，涉及 turn detection）。

---

## 4. 环境变量

```bash
# 模式：oss 时不上报 platform-usage，但仍有部分 MPS 调用（见 2.8）
DEPLOYMENT_MODE=oss

# 模板生成走本地 DeepSeek
WORKFLOW_TEMPLATE_GENERATOR=local
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# 文档分片本地化（新增）
DOCUMENT_PROCESSOR=local          # local | mps

# 跳过托管资源开通（新增）
SKIP_MANAGED_PROVISIONING=1

# 兜底：即使有残留代码，也别真打过去（本地 mock 或自建网关时用）
# MPS_API_URL=http://127.0.0.1:9999
```

> 注意：改 `.env` 后 `docker compose restart` **不生效**（容器沿用旧 env），必须 `docker compose --profile tunnel up -d api` 触发 recreate。

---

## 5. 验证命令

```bash
# 1. 确认没有任何请求再打到 services.dograh.com
docker logs dograh-api-1 2>&1 | grep -c "services.dograh.com"     # 期望 0

# 2. 确认当前生效的模型配置（把 provider 打出来）
docker exec dograh-postgres-1 psql -U postgres -d postgres -c "
  select id, name, configuration_for, credentials->>'provider' as prov
  from model_configurations order by id desc limit 5;"

# 3. 发起一次 WebRTC 测试通话，看 pipeline 实际用了哪个 STT/TTS
docker logs dograh-api-1 2>&1 | grep -E "Creating (STT|TTS|LLM) service" | tail -5

# 4. 知识库上传一个 PDF，确认走本地分片
docker logs dograh-api-1 2>&1 | grep -E "local chunk|Delegating document processing" | tail -5

# 5. 确认 pgvector 里的 chunk 数量和维度
docker exec dograh-postgres-1 psql -U postgres -d postgres -c "
  select embedding_model, embedding_dimension, count(*)
  from knowledge_base_chunks group by 1,2;"
```

---

## 6. 红线与坑

1. **`Vector(1536)` 是硬编码**（`api/db/models.py:1565`）。换 embedding 模型维度不同，必须改列 + 重建 IVFFlat 索引 + 全量重新 ingest，不能只改配置。
2. **新增 provider 必须同步改 3 处**：`ServiceProviders` 枚举、`BaseServiceConfiguration.provider` 的 Literal 白名单、`@register_*` 配置类。**漏第二处 = 保存配置直接 500，且报错信息不指向根因**。
3. **STT 换第三方必看 turn detection**。没有 EOT 判断会抢话，必须有 VAD 兜底或映射厂商的 `definite/is_final` 字段。
4. **TTS 必须流式**，否则首字延迟 2s+。非流式接口只能配 `tts_cache` 用于固定话术。
5. **`organization_bootstrap` 会偷偷写 provider=dograh 的默认配置**，不清掉的话，`quota_service` 检测到 dograh key 仍会打 MPS run-authorization。
6. **OSS + 全 BYOK 时通话前鉴权本就跳过 MPS**（`quota_service.py:795-800`），这是好消息：模型全换掉之后，通话链路可以完全离线。
7. **`workflow_run_billing.py:46` 在 OSS 下直接 return**，不上报用量；只有非 OSS 才会打 platform-usage。
8. **不要并发构建 ui 和 api**，Docker VM 内存会被打满（本地单人环境已知坑）。
9. 换 STT/TTS provider 后要重跑 `tsc`/`eslint`/`vitest` 之外，还需检查 **i18n**：provider 名称若走 `SCHEMA_TEXT` 翻译表，新 provider 的 label 需要补 `zh-CN.json` / `en.json`，否则 UI 显示英文原名。
