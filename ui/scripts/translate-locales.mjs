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
 *   - 批量调用：每批 N 条合成一次 LLM 请求（默认 40，TRANSLATE_BATCH_SIZE 可调），
 *     大幅减少请求数（2562 条 ≈ 65 次请求，而非 2562 次）
 *
 * 用法：
 *   node scripts/translate-locales.mjs                   # 不指定 → 翻译 config.ts 注册的所有语种（除 zh-CN）
 *   node scripts/translate-locales.mjs ja                 # 仅翻译缺失 key 到 ja
 *   node scripts/translate-locales.mjs ja ko --dry-run    # 只列缺失 key，不调 API
 *   TARGET_LOCALES=ja,ko node scripts/translate-locales.mjs
 *
 * 引擎（TRANSLATE_ENGINE，默认 openai）：
 *   openai  : OPENAI_API_KEY (+ OPENAI_BASE_URL, OPENAI_MODEL) 任意 OpenAI 兼容端点
 *   deepseek: OPENAI_API_KEY（DeepSeek 官方，默认 base https://api.deepseek.com/v1，模型 deepseek-chat）
 *   deepl   : DEEPL_API_KEY（原生支持批量数组）
 *   aliyun  : ALIYUN_ACCESS_KEY_ID + ALIYUN_ACCESS_KEY_SECRET（需 npm i -D @alicloud/pop-core）
 *
 * 调优：TRANSLATE_BATCH_SIZE（默认 40，单次请求携带的文案条数）
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- .env 兜底加载 ----------
// 直接在本机 cmd / PowerShell / Git Bash 里跑 npm script 时，父进程没有这些变量；
// 这里手动解析 .env（不引入 dotenv 依赖），已显式设置的环境变量优先级更高、不覆盖。
function loadEnvFile(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const k = m[1];
    if (process.env[k] !== undefined) continue; // 显式传入的优先
    let v = m[2].trim();
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

// 依次尝试 ui/.env 和仓库根 .env（后者是 Docker 部署用的那份）
for (const p of [resolve(__dirname, "..", ".env"), resolve(__dirname, "..", "..", ".env")]) {
  loadEnvFile(p);
}

// DeepSeek 复用 OPENAI_* 变量：仓库 .env 里只有 DEEPSEEK_*，这里做一次别名映射，
// 省掉每次手动 export。显式设置了 OPENAI_API_KEY 时不会走到这里。
if (!process.env.OPENAI_API_KEY && process.env.DEEPSEEK_API_KEY) {
  process.env.OPENAI_API_KEY = process.env.DEEPSEEK_API_KEY;
  process.env.OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || process.env.DEEPSEEK_BASE_URL;
  process.env.OPENAI_MODEL = process.env.OPENAI_MODEL || process.env.DEEPSEEK_MODEL;
  process.env.TRANSLATE_ENGINE = process.env.TRANSLATE_ENGINE || "deepseek";
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

const ENGINE = process.env.TRANSLATE_ENGINE || "openai";
const BATCH_SIZE = Math.max(1, parseInt(process.env.TRANSLATE_BATCH_SIZE || "40", 10));

console.log(`目标语种: ${locales.join(", ")}（源: ${SRC_LOCALE}）引擎: ${ENGINE} 批大小: ${BATCH_SIZE}`);

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

// ---------- 批量翻译引擎 ----------
// 所有引擎统一返回 (texts: string[], to: string) => Promise<string[]>
// 调用方保证 texts 与返回数组一一对应、长度一致。
async function makeEngine() {
  if (ENGINE === "openai" || ENGINE === "deepseek") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        "OPENAI_API_KEY 未设置（DeepSeek 复用同一变量）。ui/.env 与仓库根 .env 里都没找到 " +
          "OPENAI_API_KEY / DEEPSEEK_API_KEY，请先在其中之一配置。"
      );
    }
    // base 统一补 /v1：.env 里常写成 https://api.deepseek.com，直接拼 /chat/completions 虽可用，
    // 但换成别的 OpenAI 兼容端点时多数必须带版本段。
    const normalizeBase = (u) => {
      const s = String(u || "").replace(/\/+$/, "");
      return /\/v\d+$/.test(s) ? s : `${s}/v1`;
    };
    const base = normalizeBase(
      ENGINE === "deepseek"
        ? process.env.OPENAI_BASE_URL || "https://api.deepseek.com"
        : process.env.OPENAI_BASE_URL || "https://api.openai.com"
    );
    const model =
      process.env.OPENAI_MODEL || (ENGINE === "deepseek" ? "deepseek-chat" : "gpt-4o-mini");
    return async (texts, to) => {
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
                "You are a localization engine. You will receive a JSON object {\"texts\": [...]} " +
                "containing multiple source strings (Chinese). Translate ALL of them to the target " +
                "language. Return a JSON object {\"translations\": [\"t0\", \"t1\", ...]} where " +
                "translations[i] is the translation of texts[i], in the same order. " +
                "Keep any __PHn__ tokens EXACTLY as-is (do not translate or rename them). " +
                "Output ONLY the JSON object, no markdown fences, no explanations.",
            },
            { role: "user", content: `[to=${to}]\n${JSON.stringify({ texts })}` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
      const j = await res.json();
      return parseBatchArray(j.choices?.[0]?.message?.content ?? "", texts.length);
    };
  }
  if (ENGINE === "deepl") {
    const key = process.env.DEEPL_API_KEY;
    if (!key) throw new Error("DEEPL_API_KEY 未设置");
    const url =
      key.endsWith(":fx") ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";
    return async (texts, to) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: texts, target_lang: to.toUpperCase() }),
      });
      if (!res.ok) throw new Error(`DeepL ${res.status}: ${await res.text()}`);
      const j = await res.json();
      return j.translations.map((t) => t.text);
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
    const one = async (text, to) => {
      const r = await client.request(
        "TranslateGeneral",
        { FormatType: "text", SourceLanguage: "zh", TargetLanguage: to, SourceText: text, Scene: "general" },
        { method: "POST" }
      );
      return r.Data.Translated;
    };
    // 阿里云 TranslateGeneral 单次仅接受单条文本，这里并行逐条调用。
    return async (texts, to) => Promise.all(texts.map((t) => one(t, to)));
  }
  throw new Error(`未知引擎: ${ENGINE}（支持 openai / deepseek / deepl / aliyun）`);
}

// 从 LLM 返回文本中稳健解析出 string[]（期望 {"translations":[...]} 或裸数组）。
function parseBatchArray(content, n) {
  let s = (content || "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  let arr;
  try {
    const parsed = JSON.parse(s);
    arr = Array.isArray(parsed) ? parsed : parsed.translations;
  } catch {
    const m = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        arr = Array.isArray(parsed) ? parsed : parsed.translations;
      } catch {
        /* ignore */
      }
    }
  }
  if (!Array.isArray(arr)) throw new Error("无法解析批量翻译结果");
  // 长度不符时尽力补齐/截断，避免整批失败
  if (arr.length < n) arr = arr.concat(Array(n - arr.length).fill(""));
  return arr.slice(0, n);
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
    const toTranslate = []; // { key, clean, tokens }

    // 1) 遍历源，分类：保留 / ICU人工 / 待翻译
    for (const { key, value } of leaves) {
      if (typeof value !== "string") {
        if (getPath(target, key) === undefined) setPath(target, key, value);
        continue;
      }
      const existing = getPath(target, key);
      if (existing !== undefined && existing !== "") {
        kept++;
        continue; // 已存在 → 保留人工翻译
      }
      if (ICU_SYNTAX.test(value)) {
        skippedICU++;
        manual.push(key.join("."));
        if (getPath(target, key) === undefined) setPath(target, key, value);
        continue;
      }
      const { clean, tokens } = protectICU(value);
      toTranslate.push({ key, clean, tokens });
    }

    if (DRY_RUN) {
      for (const b of toTranslate) {
        missing++;
        console.log(`  [${locale}][缺失] ${b.key.join(".")}  =  ${b.clean}`);
      }
      console.log(`→ ${locale}: 缺失 ${missing} / 已保留 ${kept} / ICU需人工 ${skippedICU}`);
      if (manual.length) console.log(`  ICU 需人工: ${manual.join(", ")}`);
      continue;
    }

    // 2) 批量翻译：每批 BATCH_SIZE 条合成一次请求
    for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
      const batch = toTranslate.slice(i, i + BATCH_SIZE);
      const texts = batch.map((b) => b.clean);
      let translated;
      try {
        translated = await engine(texts, langCode(locale));
      } catch (e) {
        console.error(`  [${locale}][批次失败 ${i + 1}-${i + batch.length}] ${e.message}`);
        await sleep(500);
        continue;
      }
      if (!Array.isArray(translated) || translated.length !== batch.length) {
        console.error(
          `  [${locale}][批次长度不符 ${i + 1}] 期望 ${batch.length} 实得 ${translated?.length ?? 0}`
        );
        continue;
      }
      batch.forEach((b, idx) => {
        const tr = translated[idx] ?? b.clean;
        setPath(target, b.key, restoreICU(tr, b.tokens));
        missing++;
        console.log(`  [${locale}] ${b.key.join(".")}  ${b.clean}  →  ${tr}`);
      });
      await sleep(200); // 批次间限流
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
