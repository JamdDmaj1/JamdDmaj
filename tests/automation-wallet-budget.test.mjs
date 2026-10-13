import test from 'node:test';
import assert from 'node:assert/strict';
import {planWalletAutomationBudget,AUTOMATION_USDC_MINT} from '../lib/automation-wallet-budget.js';
const f={walletAddress:'11111111111111111111111111111111',network:'solana-mainnet',mint:AUTOMATION_USDC_MINT,balanceUnits:'100000000',reservedManualUnits:'20000000',reservedBotUnits:'10000000',feeReserveUnits:'1000000',requestedBotUnits:'40000000',observedAt:100000};
test('same-wallet allocation excludes manual and bot reservations with exact units',()=>{
 const r=planWalletAutomationBudget(f,100000);assert.equal(r.unreservedUnits,'69000000');assert.equal(r.remainingManualUnits,'29000000');assert.equal(r.signingAuthorized,false);
});
test('allocation rejects unsupported funds, stale data, and overspending',()=>{
 for(const extra of [{network:'solana-devnet'},{mint:'USDT'},{observedAt:1},{requestedBotUnits:'70000000'},{reservedManualUnits:'100000001'},{balanceUnits:'1.5'}])assert.throws(()=>planWalletAutomationBudget({...f,...extra},100000));
});
