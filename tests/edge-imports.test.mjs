import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

test("every Edge API bundles without Node built-ins or transaction SDKs", async () => {
  const files = (await readdir(new URL("../api/", import.meta.url))).filter(name => name.endsWith(".js"));
  const result = await build({
    entryPoints: files.map(name => fileURLToPath(new URL(`../api/${name}`, import.meta.url))),
    bundle: true, write: false, outdir: "edge-check", platform: "browser",
    format: "esm", target: "es2022", metafile: true, logLevel: "silent"
  });
  const inputs = Object.keys(result.metafile.inputs);
  assert.equal(inputs.some(name => name.includes("solana-devnet-token")), false,
    "Read-only Edge APIs must not load transaction creation code");
  assert.equal(inputs.some(name => name.includes("@solana/kit")), false,
    "Edge APIs must not load the Node-capable Solana SDK barrel");
});
