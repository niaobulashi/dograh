import { createRequire } from "module";
import { readFileSync } from "fs";
const require = createRequire(import.meta.url);
const ts = require("typescript");

const files = process.argv.slice(2);
let bad = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const diags = sf.parseDiagnostics || [];
  if (diags.length) {
    bad++;
    console.log("SYNTAX ERROR:", f, "->", diags.length);
    for (const d of diags.slice(0, 5)) console.log("   ", ts.flattenDiagnosticMessageText(d.messageText, "\n"));
  } else {
    console.log("OK:", f);
  }
}
console.log(bad ? `\n${bad} file(s) with syntax errors` : `\nALL ${files.length} OK`);
