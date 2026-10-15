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
};

/** 把后端透传的英文文案翻译成中文，未命中时原样返回（英文环境无影响）。 */
export function translateSchemaText(text: string | undefined | null): string {
  if (!text) return "";
  return SCHEMA_TEXT[text] ?? text;
}
