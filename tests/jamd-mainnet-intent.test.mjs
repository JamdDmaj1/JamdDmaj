import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("approved Jamd tokenomics remain preparation-only and cannot authorize mainnet", async () => {
  const draft = JSON.parse(await readFile(new URL("../security/jamd-mainnet-intent.json", import.meta.url), "utf8"));
  assert.equal(draft.token.name, "Jamd");
  assert.equal(draft.token.symbol, "JAMD");
  assert.equal(draft.token.totalSupply, "1000000000");
  assert.equal(draft.token.fixedSupply, true);
  assert.equal(draft.token.decimals, 9);
  assert.equal(draft.mainnetEnabled, false);
  assert.equal(draft.token.mintAddress, null);
  assert.equal(draft.allocation.reduce((sum,item)=>sum+item.percent,0),100);
  assert.equal(draft.allocation.reduce((sum,item)=>sum+BigInt(item.tokens),0n),1_000_000_000n);
  assert.equal(draft.initialLockedTokens,"870000000");
  assert.equal(draft.initialLockedPercent,87);
  assert.equal(draft.vesting.cliffCalendarMonths,24);
  assert.equal(draft.vesting.releaseCalendarMonths,36);
  assert.equal(draft.transactionApproval, null);
  assert.equal(draft.protections.minimumLockedBps, 8500);
  assert.equal(draft.protections.protectedParticipantSlots, 2000);
  assert.equal(draft.protections.minimumCliffCalendarMonths, 24);
  assert.equal(draft.protections.independentAuditRequired, true);
});
