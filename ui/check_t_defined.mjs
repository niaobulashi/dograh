import { createRequire } from "module";
import { readFileSync } from "fs";
const require = createRequire(import.meta.url);
const ts = require("typescript");

const files = process.argv.slice(2);
let bad = 0;
const report = [];

for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (!/\bt\(["'`]/.test(src)) continue;
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  // collect all binding names named `t` anywhere in file
  const declared = new Set();
  const walkBind = (n) => {
    if (!n) return;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "t") declared.add(n);
    if (ts.isParameter(n) && ts.isIdentifier(n.name) && n.name.text === "t") declared.add(n);
    if (ts.isImportSpecifier(n) && n.name.text === "t") declared.add(n);
    if (ts.isFunctionDeclaration(n) && n.name && n.name.text === "t") declared.add(n);
    ts.forEachChild(n, walkBind);
  };
  walkBind(sf);

  const uses = [];
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "t" && n.arguments.length && ts.isStringLiteral(n.arguments[0])) {
      uses.push(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!uses.length) continue;

  if (!declared.size) {
    bad++;
    const line = src.substring(0, uses[0].getStart(sf)).split("\n").length;
    report.push(`${f}: ${uses.length} t() call(s) but NO declaration (first at line ${line})`);
    continue;
  }

  // for each use, check some declaration is in an enclosing scope
  const declScopes = [...declared].map((d) => {
    let p = d.parent;
    while (p && !ts.isSourceFile(p) && !ts.isBlock(p) && !ts.isFunctionLike(p) && !ts.isModuleBlock(p)) p = p.parent;
    return p;
  });
  let orphan = 0;
  for (const u of uses) {
    let p = u.parent;
    let found = false;
    while (p) {
      if (declScopes.includes(p)) { found = true; break; }
      p = p.parent;
    }
    if (!found) orphan++;
  }
  if (orphan) {
    bad++;
    report.push(`${f}: ${orphan}/${uses.length} t() call(s) NOT in scope of any declaration`);
  }
}

console.log(report.join("\n") || "no undefined-t issues");
console.log(bad ? `\n${bad} file(s) with unresolved t` : "\nALL OK");
