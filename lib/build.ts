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
// htmx: ブラウザ用ビルド（グローバルに自己登録）をそのままコピー
cpSync("node_modules/htmx.org/dist/htmx.min.js", join(DIST, "js", "htmx.js"));

// 3d-force-graph: default export を window.ForceGraph3D に公開
// three.js も公開（カスタムノード描画・星空背景で使用）
const forceGraphShim = `
import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
globalThis.ForceGraph3D = ForceGraph3D;
globalThis.THREE = THREE;
`;
await Bun.write(join(DIST, "js", "_forcegraph_entry.js"), forceGraphShim);
await Bun.build({
  entrypoints: [join(DIST, "js", "_forcegraph_entry.js")],
  outdir: join(DIST, "js"),
  naming: "force-graph-3d.js",
  minify: true,
});
rmSync(join(DIST, "js", "_forcegraph_entry.js"));

// ── 2. 自作 JS コピー ──
const appScripts = ["app.js", "home.js", "graph.js"];
for (const file of appScripts) {
  cpSync(join("public", "js", file), join(DIST, "js", file));
}

// ── 3. CSS コピー ──
cpSync("node_modules/zenn-content-css/lib/index.css", join(DIST, "css", "zenn.css"));
cpSync("public/css/style.css", join(DIST, "css", "style.css"));

console.log("✓ Build complete → dist/");
