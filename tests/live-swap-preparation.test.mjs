import test from 'node:test';
import assert from 'node:assert/strict';
import {checkLiveSwapPreparation} from '../scripts/check-live-swap-preparation.mjs';
const address='11111111111111111111111111111111';
function fixture(){return {ok:true,preparation:{network:'solana-mainnet-beta',executable:false,
  requiresNativeValidation:true,inputMint:'So11111111111111111111111111111111111111112',
  outputMint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',taker:address,
  inAmount:'1000000',outAmount:'100000',minimumOut:'99500',slippageBps:50,
  receivedAt:1000,expiresAt:16000,instructions:[{}]}};}
test('live preparation probe only calls fixed first-party GET and never claims trading readiness',async()=>{
  let calls=0;
  const result=await checkLiveSwapPreparation(address,{now:()=>2000,fetchImpl:async(url,options)=>{
    calls++;assert.equal(new URL(url).origin,'https://www.jamddmaj.com');
    assert.equal(new URL(url).pathname,'/api/swap-build');assert.equal(options.method,'GET');
    assert.equal(options.body,undefined);assert.equal(options.redirect,'error');return Response.json(fixture());
  }});
  assert.equal(calls,1);assert.equal(result.fundsMoved,false);
  assert.equal(result.signing,'not-tested');assert.equal(result.confirmation,'not-tested');
});
test('probe rejects wrong account, expired quotes, unsafe outputs and executable payloads',async()=>{
  for(const patch of [{taker:'wrong'},{expiresAt:2000},{minimumOut:'1'},
    {executable:true},{transaction:'untrusted'},{signature:'untrusted'},{inAmount:'2000000'}]){
    const body=fixture();Object.assign(body.preparation,patch);
    await assert.rejects(checkLiveSwapPreparation(address,{now:()=>2000,fetchImpl:async()=>Response.json(body)}));
  }
});
