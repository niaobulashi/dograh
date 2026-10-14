import { createRequire } from "module";
import { readFileSync } from "fs";
const require = createRequire(import.meta.url);
const ts = require("typescript");

const files = process.argv.slice(2);
let bad = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const walk = (n) => {
    if (ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n)) {
      let c = 0;
      for (const st of n.statements || []) {
        if (ts.isVariableStatement(st)) {
          for (const d of st.declarationList.declarations) {
            if (ts.isIdentifier(d.name) && d.name.text === "t") c++;
          }
        }
      }
      if (c > 1) {
        bad++;
        const line = src.substring(0, n.getStart(sf)).split("\n").length;
        console.log(`DUP const t x${c} in ${f} at line ${line}`);
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
}
console.log(bad ? `${bad} block(s) with duplicate const t` : "no duplicate const t");
