import test from 'node:test';
import assert from 'node:assert/strict';
import {readOnlyRpc} from '../scripts/probe-live-swap-simulation.mjs';

test('live diagnostic refuses signing and broadcasting before any network request',async()=>{
  let requests=0;
  const fetchImpl=async()=>{requests++;throw Error('must not fetch');};
  for(const method of ['sendTransaction','sendRawTransaction','signTransaction','requestAirdrop'])
    await assert.rejects(readOnlyRpc(method,[],fetchImpl),/not read-only/);
  assert.equal(requests,0);
});

test('live diagnostic restricts RPC endpoint and checks response envelope',async()=>{
  const result=await readOnlyRpc('getGenesisHash',[],async(url,options)=>{
    assert.equal(url,'https://api.mainnet-beta.solana.com');
    assert.equal(options.redirect,'error');
    assert.equal(JSON.parse(options.body).method,'getGenesisHash');
    return {status:200,json:async()=>({jsonrpc:'2.0',id:1,result:'test'})};
  });
  assert.equal(result,'test');
  await assert.rejects(readOnlyRpc('getGenesisHash',[],async()=>({status:429})),/RPC_HTTP_429/);
});
