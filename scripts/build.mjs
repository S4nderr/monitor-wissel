import { build, context } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";

const uit = "nl.sander.monitor-wissel.sdPlugin/bin";
mkdirSync(uit, { recursive: true });
writeFileSync(`${uit}/package.json`, JSON.stringify({ type: "module" }));

const opties = {
  entryPoints: ["src/plugin.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile: `${uit}/plugin.js`,
  external: ["bufferutil", "utf-8-validate"],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  sourcemap: false,
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await context(opties);
  await ctx.watch();
} else {
  await build(opties);
}
