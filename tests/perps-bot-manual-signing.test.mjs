import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeBotManualSigning,consumeBotManualSigning} from '../lib/perps-bot-manual-signing.js';
test('a public address or fabricated JSON never grants custody signing',()=>{
 for(const value of [null,{}, {stage:'ONE_USE_BOT_MANUAL_ENTRY',reservationId:'a'.repeat(64)}])
  assert.throws(()=>consumeBotManualSigning(value),/BOT_MANUAL_SIGNING_NOT_AUTHORIZED/);
});
test('manual signing cannot begin with a fake journal or checkbox alone',async()=>{
 await assert.rejects(authorizeBotManualSigning({}, {explicitApproval:true,ownerAccountHash:'a'.repeat(64),journal:{read:()=>({state:'SIGNING'})}}));
});
