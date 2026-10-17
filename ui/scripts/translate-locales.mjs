#!/usr/bin/env node
/**
 * translate-locales.mjs —— dograh 版「中文为唯一源」多语种机器翻译。
 *
 * 复刻 udesk @udesk-webapp/translator 的核心策略：
 *   - messages/zh-CN.json 是唯一源（用户只维护中文）
 *   - 目标语种文件里「已存在」的 key 原样保留（人工翻译永不被覆盖）
 *   - 只对「缺失」key 调翻译引擎
 *
 * 相对 udesk 的改进：
 *   - ICU 占位符保护：{count} / {name} 不会被送进翻译，译完原样回填
 *   - plural / select 语法自动跳过并标记人工（机器翻译会毁掉 ICU 语法）
 *   - 引擎凭据走 env，不硬编码
 *
 * 用法：
 *   node scripts/translate-locales.mjs                   # 不指定 → 翻译 config.ts 注册的所有语种（除 zh-CN）
 *   node scripts/translate-locales.mjs ja                 # 仅翻译缺失 key 到 ja
 *   node scripts/translate-locales.mjs ja ko --dry-run    # 只列缺失 key，不调 API
 *   TARGET_LOCALES=ja,ko node scripts/translate-locales.mjs
 *
 * 引擎（TRANSLATE_ENGINE，默认 openai）：
 *   openai  : OPENAI_API_KEY (+ OPENAI_BASE_URL, OPENAI_MODEL) 任意 OpenAI 兼容端点 (Qwen/DeepSeek/...)
 *   deepl   : DEEPL_API_KEY
 *   aliyun  : ALIYUN_ACCESS_KEY_ID + ALIYUN_ACCESS_KEY_SECRET  (需 npm i -D @alicloud/pop-core)
 */

import { existsSync,readFileSync, writeFileSync } from "node:fs";
import { dirname,resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MSG_DIR = resolve(__dirname, "..", "messages");
const SRC_LOCALE = "zh-CN";

// 从 i18n/config.ts 读取已注册语种，作为「不指定目标」时的默认集合。
// 单一事实来源：新增语种只要在 config.ts 的 locales 里登记，翻译就会自动覆盖到它，
// 不必再手动逐个列语种。
function readConfigLocales() {
  try {
    const cfgPath = resolve(MSG_DIR, "..", "src", "i18n", "config.ts");
    const src = readFileSync(cfgPath, "utf8");
    const m = src.match(/export\s+const\s+locales\s*=\s*\[([^\]]*)\]/);
    if (!m) return [];
    return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).filter(Boolean);
  } catch {
    return [];
  }
}

// ---------- 参数解析 ----------
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
let locales = args.filter((a) => !a.startsWith("--"));

// 优先级：CLI 显式指定 > TARGET_LOCALES 环境变量 > config.ts 注册的全部语种（除源）。
// 不指定时一次性同步所有已注册语种，避免语种变多后逐个执行。
if (!locales.length && process.env.TARGET_LOCALES) {
  locales = process.env.TARGET_LOCALES.split(",").map((s) => s.trim()).filter(Boolean);
}
if (!locales.length) {
  locales = readConfigLocales().filter((l) => l !== SRC_LOCALE);
}
if (!locales.length) {
  console.error("用法: node scripts/translate-locales.mjs [locale ...] [--dry-run]");
  console.error("不指定语种 → 默认翻译 config.ts 中注册的所有语种（除 zh-CN）。");
  console.error("指定语种: node scripts/translate-locales.mjs ja ko");
  console.error("环境变量: TARGET_LOCALES=ja,ko node scripts/translate-locales.mjs");
  process.exit(1);
}

console.log(`目标语种: ${locales.join(", ")}（源: ${SRC_LOCALE}）`);

const ENGINE = process.env.TRANSLATE_ENGINE || "openai";

// ---------- ICU 占位符保护 ----------
const ICU_PLACEHOLDER = /\{([^{}]*\{[^}]*\}[^{}]*|[^{}]+)\}/g; // 匹配 {count} 或 {count, plural, other {...}}
const ICU_SYNTAX = /\{[^}]*,(?:\s*plural|\s*select|\s*ordinal|\s*choice)/; // plural/select/ordinal/choice

function protectICU(text) {
  // 抽出 {...} 占位符，替换为 __PH0__ 令牌，返回 {clean, tokens}
  const tokens = [];
  const clean = text.replace(ICU_PLACEHOLDER, (m) => {
    const i = tokens.length;
    tokens.push(m);
    return `__PH${i}__`;
  });
  return { clean, tokens };
}
function restoreICU(translated, tokens) {
  let out = translated;
  tokens.forEach((t, i) => {
    out = out.split(`__PH${i}__`).join(t);
  });
  return out;
}

// ---------- 翻译引擎 ----------
async function makeEngine() {
  if (ENGINE === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY 未设置");
    const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    return async (zh, to) => {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You are a localization engine. Translate the user text to the target language. " +
                "Keep any __PHn__ tokens EXACTLY as-is (do not translate or rename them). " +
                "Output only the translated text, no quotes, no explanations.",
            },
            { role: "user", content: `[to=${to}] ${zh}` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
      const j = await res.json();
      return j.choices[0].message.content.trim().replace(/^["']|["']$/g, "");
    };
  }
  if (ENGINE === "deepl") {
    const key = process.env.DEEPL_API_KEY;
    if (!key) throw new Error("DEEPL_API_KEY 未设置");
    const url = key.endsWith(":fx") ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";
    return async (zh, to) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: [zh], target_lang: to.toUpperCase() }),
      });
      if (!res.ok) throw new Error(`DeepL ${res.status}: ${await res.text()}`);
      const j = await res.json();
      return j.translations[0].text;
    };
  }
  if (ENGINE === "aliyun") {
    const id = process.env.ALIYUN_ACCESS_KEY_ID;
    const secret = process.env.ALIYUN_ACCESS_KEY_SECRET;
    if (!id || !secret) throw new Error("ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET 未设置");
    const { default: Core } = await import("@alicloud/pop-core");
    const client = new Core({
      accessKeyId: id,
      accessKeySecret: secret,
      endpoint: "https://mt.cn-hangzhou.aliyuncs.com",
      apiVersion: "2018-10-12",
    });
    // 阿里云语种码：zh -> zh / 目标用标准码
    return async (zh, to) => {
      const r = await client.request(
        "TranslateGeneral",
        { FormatType: "text", SourceLanguage: "zh", TargetLanguage: to, SourceText: zh, Scene: "general" },
        { method: "POST" }
      );
      return r.Data.Translated;
    };
  }
  throw new Error(`未知引擎: ${ENGINE}（支持 openai / deepl / aliyun）`);
}

// ---------- 嵌套结构遍历 ----------
function* walk(obj, parent = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) yield* walk(v, [...parent, k]);
    else yield { key: [...parent, k], value: v };
  }
}
function getPath(obj, keys) {
  let o = obj;
  for (const k of keys) {
    if (o == null || typeof o !== "object") return undefined;
    o = o[k];
  }
  return o;
}
function setPath(obj, keys, value) {
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (o[k] == null || typeof o[k] !== "object") o[k] = {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}

// 语种码：阿里云/OpenAI 用 2 字母，DeepL 大写；这里统一用小写 2 字母，引擎内自行映射
function langCode(locale) {
  return locale.split("-")[0].toLowerCase();
}

// ---------- 主流程 ----------
async function run() {
  const srcPath = resolve(MSG_DIR, `${SRC_LOCALE}.json`);
  const base = JSON.parse(readFileSync(srcPath, "utf8"));
  const engine = DRY_RUN ? null : await makeEngine();

  const leaves = [...walk(base)];
  console.log(`源 ${SRC_LOCALE}.json: ${leaves.length} 条 leaf`);

  for (const locale of locales) {
    const targetPath = resolve(MSG_DIR, `${locale}.json`);
    let target = existsSync(targetPath) ? JSON.parse(readFileSync(targetPath, "utf8")) : {};
    let missing = 0;
    let kept = 0;
    let skippedICU = 0;
    const manual = [];

    for (const { key, value } of leaves) {
      if (typeof value !== "string") {
        // 非字符串（如 number/boolean）直接沿用源（next-intl 极少见），保结构
        if (getPath(target, key) === undefined) setPath(target, key, value);
        continue;
      }
      const existing = getPath(target, key);
      if (existing !== undefined && existing !== "") {
        kept++;
        continue; // 已存在 → 保留人工翻译
      }
      // 缺失 → 是否需要人工
      if (ICU_SYNTAX.test(value)) {
        skippedICU++;
        manual.push(key.join("."));
        // 不自动翻译，留空让人工填（避免破坏 ICU 语法）
        if (getPath(target, key) === undefined) setPath(target, key, value);
        continue;
      }
      if (DRY_RUN) {
        missing++;
        console.log(`  [${locale}][缺失] ${key.join(".")}  =  ${value}`);
        continue;
      }
      try {
        const { clean, tokens } = protectICU(value);
        const translated = await engine(clean, langCode(locale));
        const restored = restoreICU(translated, tokens);
        setPath(target, key, restored);
        missing++;
        console.log(`  [${locale}] ${key.join(".")}  ${value}  →  ${restored}`);
      } catch (e) {
        console.error(`  [${locale}][失败] ${key.join(".")}: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 120)); // 限流
    }

    if (DRY_RUN) {
      console.log(`→ ${locale}: 缺失 ${missing} / 已保留 ${kept} / ICU需人工 ${skippedICU}`);
      if (manual.length) console.log(`  ICU 需人工: ${manual.join(", ")}`);
      continue;
    }

    writeFileSync(targetPath, JSON.stringify(target, null, 2) + "\n", "utf8");
    console.log(
      `✓ 写入 ${locale}.json: 新增 ${missing} / 保留 ${kept} / ICU需人工 ${skippedICU}` +
        (manual.length ? `  (人工: ${manual.length} 条)` : "")
    );
  }
}

run().catch((e) => {
  console.error("翻译失败:", e.message);
  process.exit(1);
});
