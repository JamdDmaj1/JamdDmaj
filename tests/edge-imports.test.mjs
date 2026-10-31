import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Manual Perps review deliberately runs on Node for the existing native-wire
// cryptographic checks. All other routes retain the strict Edge dependency gate.
const NODE_ROUTES = new Set(['perps-review.js','perps-signing-review.js']);
const NODE_READ_ROUTES = new Set(['wallet-trading-state.js']);
const NODE_OPERATOR_ROUTES = new Set(['fee-recipient-setup.js']);
const NODE_PUSH_ROUTES = new Set(['push-dispatch.js','push-subscriptions.js']);

test("every Edge API bundles without Node built-ins or transaction SDKs", async () => {
  const files = (await readdir(new URL("../api/", import.meta.url))).filter(name => name.endsWith(".js") && !NODE_ROUTES.has(name) && !NODE_READ_ROUTES.has(name) && !NODE_OPERATOR_ROUTES.has(name) && !NODE_PUSH_ROUTES.has(name));
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
test('Node push routes use explicit fetch handlers and do not import wallet signing dependencies',async()=>{
 for(const name of NODE_PUSH_ROUTES){
  const route=await import(new URL('../api/'+name,import.meta.url));assert.equal(typeof route.default.fetch,'function');
  const result=await build({entryPoints:[fileURLToPath(new URL('../api/'+name,import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',target:'node24',metafile:true,logLevel:'silent'});
  for(const forbidden of ['perps-custody-vault','perps-server-broadcast','perps-server-signing-authorization','@solana/kit'])assert.equal(Object.keys(result.metafile.inputs).some(path=>path.includes(forbidden)),false,forbidden);
 }
});

test('Node operator setup bundles separately and exposes only explicit request handlers', async()=>{
 for(const name of NODE_OPERATOR_ROUTES){
  const route=await import(new URL('../api/'+name,import.meta.url));
  assert.equal(typeof route.GET,'function');assert.equal(typeof route.POST,'function');
  assert.equal(route.config?.runtime,undefined);
  await build({entryPoints:[fileURLToPath(new URL('../api/'+name,import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',target:'node24',logLevel:'silent'});
 }
});

test('Node wallet state route uses account decoding without signing, custody or submission dependencies',async()=>{
 for(const name of NODE_READ_ROUTES){
  const route=await import(new URL('../api/'+name,import.meta.url));assert.equal(route.config?.runtime,undefined);assert.equal(typeof route.default.fetch,'function');
  const result=await build({entryPoints:[fileURLToPath(new URL('../api/'+name,import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',target:'node22',metafile:true,logLevel:'silent'});
  const inputs=Object.keys(result.metafile.inputs);
  for(const forbidden of ['perps-custody-vault','perps-execution-journal','perps-server-broadcast','perps-server-signing-authorization','perps-web-close-coordinator'])assert.equal(inputs.some(path=>path.includes(forbidden)),false,forbidden);
 }
});

test('Node manual Perps review bundles with native validation but without custody, durable journal or a submission transport',async()=>{
 const files=await readdir(new URL('../api/',import.meta.url));
 for(const name of NODE_ROUTES){
  assert(files.includes(name));
  const route=await import(new URL('../api/'+name,import.meta.url));assert.equal(typeof route.default.fetch,'function');assert.equal(route.config?.runtime,undefined);
  const result=await build({entryPoints:[fileURLToPath(new URL('../api/'+name,import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',target:'node22',metafile:true,logLevel:'silent'});
  const inputs=Object.keys(result.metafile.inputs);
  for(const forbidden of ['perps-custody-vault','perps-execution-journal','perps-server-broadcast','perps-server-signing-authorization','perps-exit-cancellation-broadcast'])assert.equal(inputs.some(path=>path.includes(forbidden)),false,forbidden);
  assert(inputs.some(path=>path.includes('perps-server-funding-simulation')));assert(inputs.some(path=>path.includes('perps-server-envelope')));
 }
});
