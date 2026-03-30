// lib/build.ts - フロントエンド静的アセットのビルド
// vendor JS を Bun.build() でバンドルし、自作 JS/CSS はコピーして dist/ に出力する

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";

// クリーンアップ
rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, "js"), { recursive: true });
mkdirSync(join(DIST, "css"), { recursive: true });

// ── 1. Vendor JS バンドル ──
// htmx: グローバルに自己登録するので import するだけでOK
await Bun.build({
  entrypoints: ["node_modules/htmx.org/dist/htmx.esm.js"],
  outdir: join(DIST, "js"),
  naming: "htmx.js",
  minify: true,
});

// cytoscape: default export を window.cytoscape に公開
const cytoscapeShim = `
import cytoscape from "cytoscape";
globalThis.cytoscape = cytoscape;
`;
await Bun.write(join(DIST, "js", "_cytoscape_entry.js"), cytoscapeShim);
await Bun.build({
  entrypoints: [join(DIST, "js", "_cytoscape_entry.js")],
  outdir: join(DIST, "js"),
  naming: "cytoscape.js",
  minify: true,
});
// エントリ用の一時ファイルを削除
rmSync(join(DIST, "js", "_cytoscape_entry.js"));

// ── 2. 自作 JS コピー ──
const appScripts = ["app.js", "home.js", "graph.js", "graph-common.js"];
for (const file of appScripts) {
  cpSync(join("public", "js", file), join(DIST, "js", file));
}

// ── 3. CSS コピー ──
cpSync("node_modules/zenn-content-css/lib/index.css", join(DIST, "css", "zenn.css"));
cpSync("public/css/style.css", join(DIST, "css", "style.css"));

console.log("✓ Build complete → dist/");
