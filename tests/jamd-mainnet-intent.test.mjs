import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {planJamdPool} from '../lib/jamd-pool-plan.js';

test("approved Jamd tokenomics remain preparation-only and cannot authorize mainnet", async () => {
  const draft = JSON.parse(await readFile(new URL("../security/jamd-mainnet-intent.json", import.meta.url), "utf8"));
  assert.equal(draft.token.name, "JamdDmaj");
  assert.equal(draft.token.symbol, "JAMD");
  assert.equal(draft.token.totalSupply, "100000000");
  assert.equal(draft.token.fixedSupply, true);
  assert.equal(draft.token.decimals, 6);
  assert.equal(draft.mainnetEnabled, false);
  assert.deepEqual(draft.intendedOperatingJurisdiction, {
    city: "Miami",
    state: "Florida",
    country: "United States"
  });
  assert.equal(draft.token.mintAddress, null);
  assert.equal(draft.allocation.reduce((sum,item)=>sum+item.percent,0),100);
  assert.equal(draft.allocation.reduce((sum,item)=>sum+BigInt(item.tokens),0n),100_000_000n);
  for(const item of draft.allocation)assert.equal(BigInt(item.tokens)*100n,BigInt(draft.token.totalSupply)*BigInt(item.percent));
  assert.equal(BigInt(draft.token.totalSupply)*10n**BigInt(draft.token.decimals),100_000_000_000_000n);
  assert.equal(draft.initialLockedTokens,null);
  assert.equal(draft.initialLockedPercent,null);
  assert.equal(draft.implementationCompatibility.existingDevnetFlowExecutesThisDistribution,false);
  assert.equal(draft.allocationStatus,'plan-only-not-distributed-or-enforced');
  assert.equal(draft.allocation.find(item=>item.category==='community').distributionMonths,60);
  assert.equal(draft.teamVestingAllocationTokens,'15000000');
  assert.equal(draft.liquidityPair,'JAMD/USDC');
  assert.equal(draft.initialPriceUsdc,'0.001');
  assert.equal(draft.initialPoolJamdTokens,'1000000');
  assert.equal(draft.liquidityBudget.amount,'1000');
  assert.equal(draft.liquidityBudget.funded,false);
  const plan=planJamdPool(draft);
  assert.equal(plan.jamdBaseUnits,'1000000000000');
  assert.equal(plan.usdcBaseUnits,'1000000000');
  assert.equal(plan.remainingLiquidityJamdBaseUnits,'24000000000000');
  assert.equal(BigInt(plan.fullyDilutedValueUsdc.numerator)/BigInt(plan.fullyDilutedValueUsdc.denominator),100000000000n);
  assert.equal(plan.executable,false);
  assert.equal(plan.transactionAuthorized,false);
  assert.throws(()=>planJamdPool({...draft,initialPriceUsdc:'0.01'}),/PRICE_MISMATCH/);
  assert.throws(()=>planJamdPool({...draft,initialPoolJamdTokens:'26000000'}),/RESERVE/);
  assert.throws(()=>planJamdPool({...draft,initialPoolJamdTokens:'1000000.0000001'}),/PRECISION/);
  assert.equal(draft.vesting.cliffCalendarMonths,24);
  assert.equal(draft.vesting.releaseCalendarMonths,36);
  assert.equal(draft.transactionApproval, null);
  assert.equal(draft.administration.wallet,'4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr');
  assert.equal(draft.administration.model,'single-owner');
  assert.equal(draft.administration.onchainAuthorityAssigned,false);
  assert.equal(draft.administration.ownershipProofVerified,false);
  assert.equal(draft.administration.controlsBotWallet,false);
  assert.equal(draft.protections.multisigAndTimelockRequired,false);
  assert.equal(draft.protections.timelockRequired,true);
  assert.match(draft.administration.riskDisclosure,/not multisig/);
  assert.equal(draft.protections.minimumLockedBps, 8500);
  assert.equal(draft.protections.protectedParticipantSlots, 2000);
  assert.equal(draft.protections.minimumCliffCalendarMonths, 24);
  assert.equal(draft.protections.independentAuditRequired, true);
});
