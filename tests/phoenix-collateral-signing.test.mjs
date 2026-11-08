import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizePhoenixCollateralSigning,consumePhoenixCollateralSigning} from '../lib/phoenix-collateral-signing.js';
test('public JSON and an owner address cannot become a collateral signing capability',()=>{
 for(const grant of [null,{}, {stage:'ONE_USE_PHOENIX_COLLATERAL',id:'a'.repeat(64),walletAddress:'11111111111111111111111111111112'}])assert.throws(()=>consumePhoenixCollateralSigning(grant),/NOT_AUTHORIZED/);
});
test('explicit checkbox approval cannot bypass durable ledger, simulation and restored custody backup',()=>{
 assert.throws(()=>authorizePhoenixCollateralSigning({explicitApproval:true,ownerAccountHash:'a'.repeat(64),journal:{read:()=>({state:'PREPARED'})},wire:{readyForSigning:true}}));
});
