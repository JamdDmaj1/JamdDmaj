import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const client = readFileSync(new URL("../lib/phoenix-manual-client.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../lib/wallet-trading-panel.js", import.meta.url), "utf8");
const positions = readFileSync(new URL("../lib/phoenix-positions-panel.js", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/perps-automation-api.js", import.meta.url), "utf8");
const service = readFileSync(new URL("../lib/phoenix-manual-service.js", import.meta.url), "utf8");
test("AUTO positions close through the automation gate from every UI path", () => {
  assert.match(api, /phoenixClosePrepare:\['action','walletAddress','workflowId','closePercent','automation'\]/);
  assert.match(client, /async prepareClose\(wallet,workflowId,closePercent=100,automation=false\)/);
  assert.match(panel, /prepareClose\(watchAddress,item\.workflowId,closePercent,item\.automation===true\)/);
  assert.match(panel, /prepareClose\(watchAddress,item\.workflowId,100,item\.automation===true\)/);
  assert.match(positions, /prepareClose\(address, item\.workflowId, 100, item\.automation === true\)/);
  assert.match(service, /closeAvailable=true;closeReason=null/);
});
