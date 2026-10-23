import { useLocale } from "next-intl";
import { useCallback } from "react";

/**
 * 后端 schema / metadata 透传文案的中文字典。
 *
 * 这些字符串来自后端运行时返回的节点 spec、模型配置 schema、电话提供方
 * metadata 和 Setup 步骤，前端直接渲染、未经过 next-intl。因文本含标点
 * （如 "."），无法作为 next-intl 的嵌套 key，故集中在此用"英文原文 → 中文"
 * 的映射处理。next-intl 默认对缺失 key 返回原文，因此英文环境不受影响。
 */
export const SCHEMA_TEXT: Record<string, string> = {
  // ---- 节点 spec（添加新节点面板 / 画布 / 编辑弹窗）----
  "Start Call": "开始通话",
  "Entry point of the workflow — plays a greeting and opens the conversation.":
    "工作流的入口——播放问候语并开启对话。",
  "Agent Node": "智能体节点",
  "Conversational step — the LLM runs one focused exchange.":
    "对话步骤——由大模型执行一次聚焦的交流。",
  "End Call": "结束通话",
  "Closes the conversation and hangs up.": "结束对话并挂断。",
  "Global Node": "全局节点",
  "Persona/tone appended to every agent node's prompt.":
    "追加到每个智能体节点提示词中的人设与语气。",
  "API Trigger": "API 触发器",
  "Public HTTP endpoints that triggers the agent and make a call over telephone.":
    "触发智能体并通过电话发起呼叫的公开 HTTP 接口。",
  "Webhook": "Webhook",
  "Sync data extracted during the conversation back to your systems after the call.":
    "通话结束后，将对话中提取的数据同步回你的系统。",
  "QA Analysis": "质检分析",
  "Run LLM quality analysis on the call transcript.":
    "对通话转写文本运行大模型质检分析。",
  "Paygent": "Paygent",
  "Cost Tracking and Billing": "费用追踪与计费",
  "Noveum": "Noveum",
  "Export the completed call to Noveum for tracing and evaluation":
    "将已完成的通话导出到 Noveum 进行追踪与评估",
  "Tuner": "Tuner",
  "Export the completed call to Tuner for Agent Observability":
    "将已完成的通话导出到 Tuner 用于智能体可观测性",

  // ---- 模型配置：采样温度 ----
  "Sampling temperature. Lower values give more predictable responses. Leave blank to use the provider default.":
    "采样温度。值越低回复越可预测。留空使用提供方默认值。",
  "Sampling temperature. Lower values give more predictable responses. Leave blank to use the provider default. Limits depend on the hosted model.":
    "采样温度。值越低回复越可预测。留空使用提供方默认值。上限取决于托管模型。",
  "Sampling temperature. Lower values give more predictable responses. Leave blank to use the provider default. Limits depend on your server and model.":
    "采样温度。值越低回复越可预测。留空使用提供方默认值。上限取决于你的服务器与模型。",
  "Sampling temperature. Lower values give more predictable responses. Leave blank to use the provider default. Google recommends leaving sampling parameters unset for Gemini 3.x.":
    "采样温度。值越低回复越可预测。留空使用提供方默认值。Google 建议在 Gemini 3.x 上不设置采样参数。",

  // ---- 电话：Cloudonix ----
  "Your Cloudonix domain (for example, acme.cloudonix.net). Dograh fetches and stores its UUID automatically.":
    "你的 Cloudonix 域名（例如 acme.cloudonix.net）。Dograh 会自动获取并存储其 UUID。",
  "Cloudonix Voice Application name whose url is updated when inbound workflows are attached to numbers on this domain. Leave blank and we will auto-create one for you on save.":
    "Cloudonix 语音应用名称。当入站工作流绑定到该域名的号码时，其 URL 会被更新。留空则保存时由我们自动为你创建一个。",

  // ---- 电话：出站中继 Setup 步骤 ----
  "Connect your SIP carrier for outbound calls": "接入你的 SIP 运营商以发起出站呼叫",
  "Under Outbound trunks, add a trunk pointing at your SIP carrier or PBX and allow its origin IP on your side. Without one Dograh has nowhere to send outbound calls.":
    "在“出站中继”下添加一条指向你的 SIP 运营商或 PBX 的中继，并允许其源 IP 访问你的一侧。否则 Dograh 无处发起出站呼叫。",

  // ---- 节点属性级（property display_name / description）----
  "Prompt": "提示词",
  "System prompt for this node. Supports {{template_variables}}.":
    "本节点的系统提示词。支持 {{template_variables}}。",
  "Allow Interruption": "允许打断",
  "When true, the user can interrupt the agent mid-utterance.":
    "为 true 时，用户可在智能体说话过程中打断。",
  "Add Global Prompt": "追加全局提示",
  "When true and a Global node exists, prepends the global prompt to this node's prompt at runtime.":
    "为 true 且存在全局节点时，运行时将全局提示词前置到本节点提示词之前。",
  "Enable Variable Extraction": "启用变量提取",
  "When true, runs an LLM extraction pass for this node.":
    "为 true 时，对本节点运行一次大模型提取。",
  "Extraction Prompt": "提取提示词",
  "Overall instructions guiding variable extraction.": "指导变量提取的总体指令。",
  "Variables to Extract": "待提取变量",
  "Each entry declares one variable to capture, with its name, data type, and extraction hint. Call outcomes are configured separately in workflow settings.":
    "每条声明一个待提取的变量，包含名称、数据类型与提取提示。呼叫结果在流程设置中单独配置。",
  "Variable Name": "变量名称",
  "snake_case identifier used downstream.": "下游使用的 snake_case 标识符。",
  "Type": "类型",
  "Data type of the extracted value.": "提取值的类型。",
  "Extraction Hint": "提取提示",
  "Per-variable hint describing what to look for.": "每个变量的提示，描述要提取的内容。",
  "Header Name": "请求头名称",
  "HTTP header name (e.g., 'X-Source').": "HTTP 请求头名称（如 'X-Source'）。",
  "Header Value": "请求头值",
  "Header value (supports {{template_variables}}).": "请求头值（支持 {{template_variables}}）。",
  "Tools": "工具",
  "Tools this node can invoke.": "本节点可调用的工具。",
  "Knowledge Base Documents": "知识库文档",
  "Documents this node can reference.": "本节点可引用的知识库文档。",
  "Enabled": "启用",
  "Agent ID": "智能体 ID",
  "The agent identifier registered in your Paygent account.":
    "你在 Paygent 账户中注册的智能体标识。",
  "The agent identifier registered in your Tuner workspace.":
    "你在 Tuner 工作区中注册的智能体标识。",
  "Customer ID": "客户 ID",
  "Your Paygent customer / organisation ID.": "你的 Paygent 客户 / 组织 ID。",
  "Paygent API Key": "Paygent API 密钥",
  "API key used to authenticate requests to the Paygent REST API.":
    "用于向 Paygent REST API 发起请求鉴权的 API 密钥。",
  "When false, Dograh skips all Paygent tracking for this call.":
    "为 false 时，Dograh 跳过本通呼叫的所有 Paygent 追踪。",
  "Noveum API Key": "Noveum API 密钥",
  "Bearer token used when exporting the completed call to Noveum.":
    "将已结束的通话导出到 Noveum 时使用的 Bearer 令牌。",
  "Noveum Project": "Noveum 项目",
  "The Noveum project the call trace is exported into.": "通话轨迹导出到的 Noveum 项目。",
  "Noveum Environment": "Noveum 环境",
  "Environment label stamped on exported traces (e.g. production, staging).":
    "导出轨迹上标记的环境标签（如 production、staging）。",
  "When false, Dograh skips exporting this call to Noveum.":
    "为 false 时，Dograh 跳过将本通呼叫导出到 Noveum。",
  "Capture per-segment STT/TTS audio and the full-conversation recording for audio evaluation on Noveum.":
    "采集每段 STT/TTS 音频及完整通话录音，用于在 Noveum 上进行音频评估。",
  "Tuner API Key": "Tuner API 密钥",
  "Bearer token used when posting completed calls to Tuner.":
    "将已结束的通话推送到 Tuner 时使用的 Bearer 令牌。",
  "Tuner Agent ID": "Tuner 智能体 ID",
  "Tuner Workspace ID": "Tuner 工作区 ID",
  "Your numeric Tuner workspace ID.": "你的 Tuner 工作区数字 ID。",
  "When false, Dograh skips exporting this call to Tuner.":
    "为 false 时，Dograh 跳过将本通呼叫导出到 Tuner。",
  "Calculate cost": "计算费用",
  "Send a per-call cost to Tuner, computed from your own provider rates (BYOK). All rates below are optional.":
    "将单通呼叫费用按你自有的服务方费率（BYOK）发送给 Tuner。以下费率均为可选。",
  "Record audio": "录音",
  "Telephony": "电话",
  "Indicator": "指标",
  "The indicator event name sent at the end of the call (e.g. per-minute-call).":
    "通话结束时发送的指标事件名称（如 per-minute-call）。",
  "USD per minute": "每分钟美元",
  "USD per 1K characters": "每千字符美元",
  "USD per 1M tokens": "每百万 token 美元",
  "USD per 1M cached tokens": "每百万缓存 token 美元",
  "LLM input": "LLM 输入",
  "LLM cached input": "LLM 缓存输入",
  "LLM output": "LLM 输出",
  "String": "字符串",
  "Number": "数值",
  "Boolean": "布尔值",
  "STT": "语音转文本（STT）",
  "TTS": "语音合成（TTS）",

  // ---- Start Call：预呼叫 / 问候 ----
  "Controls when a POST request is made to enrich the call context before the Start node opens.":
    "控制何时发起 POST 请求，在 Start 节点开启前丰富呼叫上下文。",
  "URL the pre-call POST request is sent to. The request body includes caller and called numbers.":
    "预呼叫 POST 请求发送到的 URL。请求体包含主叫与被叫号码。",
  "Optional credential attached to the pre-call request.": "附加到预呼叫请求的可选凭证。",
  "Whether the optional greeting is spoken via TTS from text or played from a pre-recorded audio file.":
    "可选问候语是通过 TTS 从文本播报，还是播放预录音频文件。",
  "Text spoken via TTS at the start of the call. Supports {{template_variables}}. Leave empty to skip the greeting.":
    "通话开始时通过 TTS 播报的文本。支持 {{template_variables}}。留空则跳过问候。",
  "Pre-recorded audio file played at the start of the call.": "通话开始时播放的预录音频文件。",
  "Seconds to listen for a silent answer before opening. 0.1–10. Replaces the default 1.2-second listening window.":
    "开场前静音等待应答的秒数。范围 0.1–10，替换默认的 1.2 秒监听窗口。",
  "Set the initial listening window for outbound voicemail and screening handling. A brief human greeting can end the wait sooner.":
    "为出站语音留言与筛选处理设置初始监听窗口。简短的人工问候可更快结束等待。",

  // ---- Webhook ----
  "URL the request is sent to.": "请求发送到的 URL。",
  "HTTP verb used for the outbound request.": "出站请求使用的 HTTP 方法。",
  "Additional HTTP headers to include with the request.": "随请求一同包含的额外 HTTP 请求头。",
  "JSON body of the request. Values are Jinja-rendered against the run context — `{{workflow_run_id}}`, `{{gathered_context.foo}}`, `{{annotations.qa_xxx}}`, etc.":
    "请求的 JSON 体。值会基于运行上下文进行 Jinja 渲染——`{{workflow_run_id}}`、`{{gathered_context.foo}}`、`{{annotations.qa_xxx}}` 等。",
  "Optional credential applied as the Authorization header.": "作为 Authorization 请求头附加的可选凭证。",
  "When false, the webhook is skipped at run time.": "为 false 时，运行时跳过该 Webhook。",
  "Calls shorter than this are skipped.": "短于此长度的呼叫将被跳过。",
  "Required for the Azure provider.": "使用 Azure 提供方时必填。",

  // ---- API Trigger ----
  "API key for the chosen provider.": "所选服务提供方的 API 密钥。",
  "Path segment that uniquely identifies this trigger. Used in both URLs:\n  • Production: `/api/v1/public/agent/<trigger_path>` — executes the published agent.\n  • Test: `/api/v1/public/agent/test/<trigger_path>` — executes the latest draft.\nCan be customized to a descriptive value up to 36 characters using letters, numbers, hyphens, or underscores.":
    "唯一标识该触发器的路径段。用于两个 URL：\n  • 生产：`/api/v1/public/agent/<trigger_path>` —— 执行已发布的智能体。\n  • 测试：`/api/v1/public/agent/test/<trigger_path>` —— 执行最新草稿。\n可自定义为不超过 36 个字符的描述性值，仅含字母、数字、连字符或下划线。",
  "When false, the trigger URL returns 404.": "为 false 时，触发器 URL 返回 404。",

  // ---- Agent Node（field_overrides 覆盖）----
  "Agent system prompt for this step. Supports {{template_variables}} from extraction or pre-call fetch.":
    "本步骤的智能体系统提示词。支持来自提取或预呼叫获取的 {{template_variables}}。",
  "Agent system prompt for the opening turn. Supports {{template_variables}} from pre-call fetch and the initial context.":
    "开场轮次的智能体系统提示词。支持来自预呼叫获取与初始上下文的 {{template_variables}}。",
  "Agent system prompt for the closing exchange. Supports {{template_variables}} from extraction or pre-call fetch.":
    "收尾轮次的智能体系统提示词。支持来自提取或预呼叫获取的 {{template_variables}}。",
  "Short identifier for this step (e.g., 'Qualify Budget'). Appears in call logs and edge transition tools.":
    "本步骤的简短标识（如 'Qualify Budget'）。出现在呼叫日志与边转移工具中。",
  "Tools the agent can invoke during this step.": "智能体在本步骤可调用的工具。",
  "Tools the agent can invoke during the opening turn.": "智能体在开场轮次可调用的工具。",
  "Documents the agent can reference during this step.": "智能体在本步骤可引用的文档。",
  "Text appended to every prompted node's system prompt when that node has `add_global_prompt=true`. Supports {{template_variables}}.":
    "当节点 `add_global_prompt=true` 时，追加到每个带提示节点的系统提示词末尾。支持 {{template_variables}}。",
  "When true, the user can interrupt the agent mid-utterance. Set false for non-interruptible disclosures.":
    "为 true 时，用户可在智能体说话过程中打断。非可打断的告知性内容请设为 false。",
  "Ask the caller about their budget and timeline.": "询问来电者的预算与时间安排。",

  // ---- Global Node（prompt 覆盖文本与 Agent 段相同，已在上方覆盖，无需重复）----

  // ---- QA Analysis ----
  "Short identifier for this QA configuration.": "本质检配置项的简短标识。",
  "LLM provider used for the QA pass.": "质检环节使用的大模型提供方。",
  "Model identifier (e.g., 'gpt-4o', 'claude-sonnet-4-6'). Provider-specific.":
    "模型标识（如 'gpt-4o'、'claude-sonnet-4-6'）。因提供方而异。",
  "Percent of eligible calls QA'd. 100 means every call; lower values use random sampling.":
    "参与质检的合格呼叫百分比。100 表示每通都检；较低值采用随机抽样。",
  "Instructions to the QA reviewer LLM. Supports placeholders: `{node_summary}`, `{previous_conversation_summary}`, `{transcript}`, `{metrics}`.":
    "提供给质检评审大模型的指令。支持占位符：`{node_summary}`、`{previous_conversation_summary}`、`{transcript}`、`{metrics}`。",
  "When true, the QA pass uses the same LLM the workflow runs with. Set false to specify a separate provider/model.":
    "为 true 时，质检环节使用与流程相同的大模型。设为 false 可指定独立提供方/模型。",
  "When false, the QA run is skipped.": "为 false 时，跳过质检运行。",

  // ---- End Call ----
  "Short identifier shown in call logs. Should describe the ending context (e.g., 'Successful close', 'Polite decline').":
    "显示在呼叫日志中的简短标识。应描述结束语境（如 'Successful close'、'Polite decline'）。",
  "When true, runs an LLM extraction pass before hangup to capture variables from the conversation.":
    "为 true 时，在挂断前运行一次大模型提取，从对话中捕获变量。",

  // ---- 通用短标识（name 字段覆盖，start/end/webhook/global 等）----
  "Short identifier shown in the canvas and call logs.": "显示于画布与呼叫日志中的简短标识。",
  "Short identifier shown in the canvas and call logs. Has no runtime effect.":
    "显示于画布与呼叫日志中的简短标识。无运行时影响。",
  "Short identifier shown in the canvas and run logs.": "显示于画布与运行日志中的简短标识。",
  "Short identifier shown in the canvas. No runtime effect.": "显示于画布中的简短标识。无运行时影响。",

  // ---- Paygent / Noveum / Tuner 配置短标识 ----
  "Short identifier for this Paygent configuration.": "本 Paygent 配置项的简短标识。",
  "Short identifier for this Noveum export configuration.": "本 Noveum 导出配置项的简短标识。",
  "Short identifier for this Tuner export configuration.": "本 Tuner 导出配置项的简短标识。",

  // ---- 变量提取通用覆盖 ----
  "Overall instructions guiding how variables should be extracted from the conversation.":
    "指导应从对话中提取哪些变量的总体指令。",
  "Each entry declares one variable to capture from the conversation, with its name, data type, and a per-variable extraction hint.":
    "每条声明一个待从对话中提取的变量，包含名称、数据类型与逐变量提取提示。",
  "Documents the agent can reference.": "智能体可引用的文档。",

  // ---- 节点字段 display_name（Start Call / 通用 / QA 等）----
  "Name": "名称",
  "Greeting Type": "问候类型",
  "Greeting Text": "问候文本",
  "Greeting Recording": "问候录音",
  "Allow Greeting Interruption": "允许打断问候",
  "Minimum Words to Interrupt": "打断所需最少字数",
  "Allow Interruptions After Greeting": "问候后允许打断",
  "Delayed Start": "延迟开始",
  "Delay Duration (seconds)": "延迟时长（秒）",
  "Pre-Call Data Fetch": "呼叫前数据获取",
  "Endpoint URL": "端点 URL",
  "Authentication": "认证",
  "Global Prompt": "全局提示词",
  "Trigger Path": "触发路径",
  "HTTP Method": "HTTP 方法",
  "Custom Headers": "自定义请求头",
  "Payload Template": "请求体模板",
  "System Prompt": "系统提示词",
  "Minimum Call Duration (seconds)": "最短通话时长（秒）",
  "Include Voicemail Calls": "包含语音留言呼叫",
  "Sample Rate (%)": "抽样比例（%）",
  "Use Workflow's LLM": "使用工作流的大模型",
  "QA LLM Provider": "质检大模型提供方",
  "QA Model": "质检模型",
  "API Key": "API 密钥",
  "Azure Endpoint": "Azure 端点",

  // ---- 节点字段 description / placeholder（Start Call 等）----
  "Let the caller interrupt the opening greeting. When off, caller speech is retained until the greeting finishes. Applies to cascade and realtime openings. Realtime uses provider or local speech detection according to the adapter when interruptions are allowed.":
    "允许来电者打断开场问候。关闭时，来电者的语音会保留至问候结束。适用于级联与实时开场。允许打断时，实时模式按适配器使用服务方或本地语音检测。",
  "Cascade only: interrupt when the caller's transcription contains at least this many words. Realtime providers do not support this word threshold; they use provider or local speech detection according to the adapter.":
    "仅级联模式：当来电者的转写文本至少包含这么多个词时打断。实时提供方不支持该词数阈值；它们按适配器使用服务方或本地语音检测。",
  "Pre-recorded audio file played at the start of the call. Required when Greeting Type is Pre-recorded Audio.":
    "通话开始时播放的预录音频文件。当问候类型为“预录音频”时必填。",
  "Allow the caller to interrupt responses after the opening greeting.":
    "允许来电者在开场问候之后打断回复。",
  "Listen before the opening in cascade and realtime calls. If the caller speaks first, respond to them instead. Enabled voicemail handling can resolve a human answer sooner.":
    "在级联与实时通话开场前先监听。若来电者先开口，则改为回应他们。启用语音留言处理后，可更快判定真人应答。",
  "Seconds to listen for a silent answer before opening. 0–10. With voicemail handling, replaces its default 1.2-second window.":
    "开场前静音等待应答的秒数。0–10。启用语音留言处理后，替换其默认的 1.2 秒窗口。",
  "Greet the caller warmly and ask how you can help today.":
    "热情地问候来电者，并询问今天有什么可以帮忙。",
  "Establishes a consistent persona across the call.":
    "在整个通话中建立一致的人设。",
  "Hi {{first_name}}, this is Sarah from Acme.":
    "你好 {{first_name}}，我是 Acme 的 Sarah。",
  "You are a friendly assistant calling on behalf of {{company_name}}.":
    "你是一名代表 {{company_name}} 致电的友好助手。",
  "Thank the caller and confirm next steps before ending the call.":
    "在结束通话前感谢来电者并确认后续步骤。",
  "When false, calls flagged as voicemail are skipped.":
    "为 false 时，被标记为语音留言的呼叫将被跳过。",

  // ---- 节点字段下拉选项 label（品牌名与 HTTP 方法保持原样）----
  "Text (TTS)": "文本（TTS）",
  "Pre-recorded Audio": "预录音频",
  "Disabled": "禁用",
  "Always": "始终",
  "Inbound calls only": "仅入站呼叫",
  "Outbound calls only": "仅出站呼叫",
};

/** 把后端透传的英文文案翻译成中文，未命中时原样返回（英文环境无影响）。 */
export function translateSchemaText(text: string | undefined | null, locale?: string): string {
  if (!text) return "";
  // The dictionary is zh-only; other locales keep the backend's own copy.
  if (locale && !locale.toLowerCase().startsWith("zh")) return text;
  // Backend strings occasionally carry a trailing/leading space (implicit
  // string concatenation), so fall back to a trimmed lookup.
  const hit = SCHEMA_TEXT[text] ?? SCHEMA_TEXT[text.trim()];
  return hit ?? text;
}

/**
 * Locale-aware translator for backend-provided schema copy. Components call
 * this so the dictionary only applies to zh locales instead of every locale.
 */
export function useSchemaText() {
  const locale = useLocale();
  return useCallback((text?: string | null) => translateSchemaText(text, locale), [locale]);
}
