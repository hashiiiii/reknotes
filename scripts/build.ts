import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, "js"), { recursive: true });
mkdirSync(join(DIST, "css"), { recursive: true });
mkdirSync(join(DIST, "image"), { recursive: true });

// The browser build of htmx registers its own global and needs no bundle wrapper.
cpSync("node_modules/htmx.org/dist/htmx.min.js", join(DIST, "js", "htmx.js"));

// Browser scripts expect globals for the graph library and Three.js rendering helpers.
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

const appScripts = ["app.js", "home.js", "graph.js"];
for (const file of appScripts) {
  cpSync(join("public", "js", file), join(DIST, "js", file));
}

cpSync("node_modules/zenn-content-css/lib/index.css", join(DIST, "css", "zenn.css"));
cpSync("public/css/style.css", join(DIST, "css", "style.css"));

cpSync("public/image/favicon.svg", join(DIST, "image", "favicon.svg"));

console.log("Build complete: dist/");
