// AST-based i18n extractor/replacer (v2 - safer).
// Usage: node i18n_run.mjs <file> <namespace> [--apply] [--preview] [--noinsert]
import { createRequire } from "module";
import { readFileSync, writeFileSync } from "fs";
const require = createRequire(import.meta.url);
const ts = require("typescript");

const file = process.argv[2];
let NS = process.argv[3];
if (NS && NS.startsWith("--")) NS = undefined;
const APPLY = process.argv.includes("--apply");
const PREVIEW = process.argv.includes("--preview");
const NOINSERT = process.argv.includes("--noinsert");
const NOTHROW = process.argv.includes("--nothrow");

const src = readFileSync(file, "utf8");
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Auto-detect the dominant namespace from existing useTranslations/getTranslations
// calls in the file, so callers can omit the NS argument.
function autoDetectNs() {
  const re = /(?:useTranslations|getTranslations)\(\s*["']([^"']+)["']/g;
  const counts = {};
  let m;
  while ((m = re.exec(src))) {
    const ns = m[1];
    if (ns === "Global" || ns === "") continue;
    counts[ns] = (counts[ns] || 0) + 1;
  }
  let best = null, bn = 0;
  for (const k of Object.keys(counts)) if (counts[k] > bn) { bn = counts[k]; best = k; }
  if (best) return best;
  if (/app\/workflow|components\/workflow|components\/flow/.test(file)) return "Workflow";
  if (/components\/ui/.test(file)) return "Shared";
  if (/components\/layout/.test(file)) return "Nav";
  if (/components\/lead-forms/.test(file)) return "LeadForms";
  if (/components\/billing/.test(file)) return "Billing";
  if (/components\/onboarding/.test(file)) return "Onboarding";
  if (/components\/http/.test(file)) return "Tools";
  if (/lib\/auth|app\/auth/.test(file)) return "Auth";
  if (/\/context\//.test(file)) return "Common";
  if (/components\//.test(file)) return "Shared";
  if (/app\//.test(file)) return "Common";
  return "Common";
}
if (!NS || NS === "auto") NS = autoDetectNs();

function decode(s) {
  return s
    .replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
    .replace(/&apos;/g, "’").replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
const isUiAttr = (n) => ["placeholder", "title", "aria-label", "aria-placeholder", "aria-valuetext", "alt"].includes(n);
const isUiProp = (n) => ["label", "title", "description", "placeholder", "message", "text", "tooltip", "hint", "header", "ariaLabel", "emptyText", "confirmText", "cancelText", "submitText"].includes(n);

// reverse map of existing english across namespaces (same-ns reuse only)
import { readdirSync } from "fs";
const reverse = {};
for (const fn of readdirSync("messages")) {
  if (!/^(zh-CN|en)\.json$/.test(fn)) continue;
  const d = JSON.parse(readFileSync("messages/" + fn, "utf8"));
  for (const ns of Object.keys(d)) {
    const o = d[ns];
    if (typeof o !== "object" || !o) continue;
    for (const k of Object.keys(o)) if (typeof o[k] === "string") (reverse[o[k]] ||= []).push({ ns, key: k });
  }
}

function callName(node) {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return { base: null, name: callee.text };
  if (ts.isPropertyAccessExpression(callee)) return { base: callee.expression.getText(sf), name: callee.name.text };
  return null;
}
// Skip strings that are not user-facing or should not be localized.
function shouldSkip(english) {
  const s = english.trim();
  if (!s) return true;
  if (/^https?:\/\//i.test(s)) return true;        // URLs
  if (/@[\w.-]+\.\w{2,}/.test(s)) return true;      // emails
  if (/\.\.\./.test(s)) return true;                // example placeholders ("pk-lf-...")
  if (/must be used within/i.test(s)) return true;   // hook provider guard errors
  if (/^(id|x-vicidial|pk-|sk-|x-)/i.test(s)) return true;
  if (/^[\w.-]+\.[a-z]{2,}\.[a-z]{2,}/i.test(s)) return true; // bare domains (app.dograh.com)
  if (/^[\w .'-]+inc\.$/i.test(s)) return true;     // company samples ("Acme Inc.")

  // --- technical / code-ish strings (must NOT be translated) ---
  if (/[{}<>|;=]/.test(s)) return true;                       // code punctuation
  if (/\(\)/.test(s)) return true;                            // "getMessages()"
  if (/^[A-Za-z_.]+\([A-Za-z_.]*\)$/.test(s)) return true;    // function-call token
  if (/^[A-Za-z]+:$/.test(s)) return true;                    // code label ("React:")
  if (/\{\{|\}\}/.test(s)) return true;                       // template vars
  if (/^[a-z]+[A-Z]/.test(s)) return true;                    // camelCase identifiers
  if (/^[a-z]+_[a-z]+/.test(s)) return true;                  // snake_case identifiers
  if (/\.[a-zA-Z]/.test(s) && /^[a-z_]+(\.[a-zA-Z_]+)+$/.test(s)) return true; // dotted paths
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return true;   // hex colors
  if (/^(null|true|false|undefined|NaN)$/i.test(s)) return true; // JS literals
  if (/^(data-|on[A-Z]|window\.|document\.)/.test(s)) return true;
  if (/^\W*[A-Z0-9]{1,3}\W*$/.test(s)) return true;            // short all-caps acronyms (US, KB, MB), POST, v
  if (/^[a-z]+$/.test(s)) return true;                         // single lowercase word = identifier/value
  if (/\+?\d[\d\s().+-]{4,}/.test(s)) return true;            // phone numbers / numeric
  if (/^[a-z]+(-[a-z]+)+$/.test(s)) return true;              // kebab-case ("your-api-key")
  if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(s)) return true;
  if (s.length <= 2) return true;                             // "s", "v", "ms"
  return false;
}
function slugify(s) {
  s = decode(s).trim();
  let out = "", cap = false;
  for (const ch of s) {
    if (/[A-Za-z0-9]/.test(ch)) { out += cap ? ch.toUpperCase() : ch.toLowerCase(); cap = false; }
    else if (/\s/.test(ch)) cap = true;
  }
  out = out.replace(/^[^a-zA-Z]+/, "");
  if (!out) out = "s";
  return out;
}

const edits = [];
const usedKeys = new Set();
const fileKey = {};
const reused = [];
const funcsNeedT = new Map();

function reserveKey(english, ns) {
  if (reverse[english]) {
    const hit = reverse[english].find((h) => h.ns === ns);
    if (hit) return { key: hit.key, reused: true };
  }
  let base = slugify(english), key = base, i = 2;
  while (usedKeys.has(ns + ":" + key)) key = base + i++;
  usedKeys.add(ns + ":" + key);
  fileKey[key] = decode(english);
  return { key, reused: false };
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function enclosingFunc(node) {
  let p = node.parent;
  while (p) {
    if (ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isArrowFunction(p) || ts.isMethodDeclaration(p)) {
      if (p.body && ts.isBlock(p.body)) return p; // only block-body functions
    }
    p = p.parent;
  }
  return null;
}
function ensureT(funcNode, ns) {
  if (!funcNode) return;
  if (!funcsNeedT.has(funcNode)) funcsNeedT.set(funcNode, new Set());
  funcsNeedT.get(funcNode).add(ns);
}
// Returns true if the function already declares `const t` at its own top level.
function hasDirectT(funcNode) {
  const body = funcNode.body;
  if (!body || !ts.isBlock(body)) return false;
  for (const stmt of body.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (decl.name.getText(sf) === "t") return true;
      }
    }
  }
  return false;
}

const visit = (node) => {
  if (ts.isJsxText(node)) {
    const trimmed = node.text.replace(/^\s+|\s+$/g, "");
    if (!trimmed || !/[A-Za-z]/.test(trimmed) || /^[\{\}<>]/.test(trimmed)) return;
    const english = decode(trimmed);
    if (shouldSkip(english)) return;
    const { key, reused: rz } = reserveKey(english, NS);
    const func = enclosingFunc(node);
    if (!func) return; // skip module-level candidates
    ensureT(func, NS);
    edits.push({ pos: node.getStart(sf), end: node.getEnd(sf), text: `{t("${key}")}` });
    if (rz) reused.push({ english, key });
  } else if (ts.isJsxAttribute(node)) {
    const name = node.name.getText(sf);
    if (!isUiAttr(name)) return;
    const init = node.initializer;
    if (!init || !ts.isStringLiteral(init)) return;
    const english = decode(init.text);
    if (!english.trim() || shouldSkip(english)) return;
    const { key, reused: rz } = reserveKey(english, NS);
    const func = enclosingFunc(node);
    if (!func) return;
    ensureT(func, NS);
    edits.push({ pos: init.getStart(sf), end: init.getEnd(sf), text: `{t("${key}")}` });
    if (rz) reused.push({ english, key });
  } else if ((ts.isPropertyAssignment(node) || ts.isPropertySignature(node)) && node.initializer && ts.isStringLiteral(node.initializer)) {
    const pname = node.name.getText(sf);
    if (!isUiProp(pname)) return;
    const english = decode(node.initializer.text);
    if (!english.trim() || /^[\.\/]/.test(english) || shouldSkip(english)) return;
    const { key, reused: rz } = reserveKey(english, NS);
    const func = enclosingFunc(node);
    if (!func) return;
    ensureT(func, NS);
    edits.push({ pos: node.initializer.getStart(sf), end: node.initializer.getEnd(sf), text: `t("${key}")` });
    if (rz) reused.push({ english, key });
  } else if (ts.isCallExpression(node)) {
    const cn = callName(node);
    const handle = cn && ((cn.base === null && (cn.name === "setError" || cn.name === "toast")) || (cn.base === "toast" && cn.name === "error"));
    if (handle) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        const english = decode(arg.text);
        if (english.trim() && !/^[\.\/]/.test(english) && !shouldSkip(english)) {
          const { key, reused: rz } = reserveKey(english, NS);
          const func = enclosingFunc(node);
          if (func) {
            ensureT(func, NS);
            edits.push({ pos: arg.getStart(sf), end: arg.getEnd(sf), text: `t("${key}")` });
            if (rz) reused.push({ english, key });
          }
        }
      }
    }
  } else if (!NOTHROW && ts.isThrowStatement(node)) {
    const ex = node.expression;
    if (ex && ts.isNewExpression(ex) && ex.expression.getText(sf) === "Error") {
      if (!/(\.test\.|\.gen\.|[\/\\]lib[\/\\])/.test(file)) {
        const arg = ex.arguments && ex.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          const english = decode(arg.text);
          if (english.trim() && !/^[\.\/]/.test(english)) {
            const { key, reused: rz } = reserveKey(english, NS);
            const func = enclosingFunc(node);
            if (func) {
              ensureT(func, NS);
              edits.push({ pos: arg.getStart(sf), end: arg.getEnd(sf), text: `t("${key}")` });
              if (rz) reused.push({ english, key });
            }
          }
        }
      }
    }
  }
  ts.forEachChild(node, visit);
};
visit(sf);

// const t declarations per function
const insertions = [];
for (const [funcNode, nss] of funcsNeedT) {
  const isAsync = !!(funcNode.modifiers && funcNode.modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword));
  for (const ns of nss) {
    if (hasDirectT(funcNode)) continue; // already has `const t`; reuse it
    const decl = isAsync
      ? `const t = await getTranslations("${NS}");`
      : `const t = useTranslations("${NS}");`;
    const body = funcNode.body;
    if (!body || !ts.isBlock(body)) continue;
    const ip = body.getStart(sf) + 1;
    insertions.push({ pos: ip, end: ip, text: "\n    " + decl });
  }
}

// import next-intl if needed
let importEdit = null;
if (!NOINSERT && funcsNeedT.size > 0) {
  let needServer = false;
  for (const [funcNode] of funcsNeedT) {
    if (funcNode.modifiers && funcNode.modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) needServer = true;
  }
  const hasImport = /from\s+["']next-intl["']/.test(src) || /from\s+["']next-intl\/server["']/.test(src);
  if (!hasImport) {
    const line = needServer
      ? `import { useTranslations } from "next-intl";\nimport { getTranslations } from "next-intl/server";\n`
      : `import { useTranslations } from "next-intl";\n`;
    const m = src.match(/^(\s*["']use (client|strict)["'];?\s*\n)/);
    importEdit = m ? { pos: m[1].length, end: m[1].length, text: line } : { pos: 0, end: 0, text: line };
  }
}

const all = [...edits, ...insertions];
if (importEdit) all.push(importEdit);
all.sort((a, b) => b.pos - a.pos);

let out = src;
for (const e of all) out = out.slice(0, e.pos) + e.text + out.slice(e.end);

if (PREVIEW) {
  const pf = "E:/workspace/my/dograh/ui/i18n_preview_out.tsx";
  writeFileSync(pf, out, "utf8");
  console.log(JSON.stringify({ preview: pf, candidates: Object.keys(fileKey).length, reused: reused.length, newKeys: fileKey }, null, 2));
  process.exit(0);
}
if (!APPLY) {
  console.log(JSON.stringify({ file, ns: NS, candidates: Object.keys(fileKey).length, reused: reused.length, newKeys: fileKey, reusedList: reused.slice(0, 30) }, null, 2));
  process.exit(0);
}
writeFileSync(file, out, "utf8");
console.log(JSON.stringify({ file, applied: true, newKeys: fileKey, reusedCount: reused.length }, null, 2));
