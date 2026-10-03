import assert from 'node:assert/strict';
import {getCompiledTransactionMessageEncoder} from '@solana/kit';
import bs58 from 'bs58';

// Read-only devnet probe. No private key, signature, airdrop or submission API.
const payer=process.argv[2];
assert.equal(bs58.decode(payer??'').length,32,'Provide a funded devnet public address');
const allowed=new Set(['getGenesisHash','getAccountInfo','getLatestBlockhash','getFeeForMessage','simulateTransaction']);
async function rpc(method,params=[]) {
  assert(allowed.has(method));
  const response=await fetch('https://api.devnet.solana.com',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
  assert(response.ok,`RPC HTTP ${response.status}`);
  const result=await response.json();
  assert(!result.error,JSON.stringify(result.error));
  return result.result;
}
assert.equal(await rpc('getGenesisHash'),'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
const before=await rpc('getAccountInfo',[payer,{commitment:'confirmed',encoding:'base64'}]);
assert(before.value && before.value.owner==='11111111111111111111111111111111');
const latest=await rpc('getLatestBlockhash',[{commitment:'confirmed',minContextSlot:before.context.slot}]);
// A self-transfer has zero asset movement; its simulated payer delta isolates the fee.
const transfer=Buffer.alloc(12); transfer.writeUInt32LE(2); transfer.writeBigUInt64LE(1n,4);
const message=Buffer.from(getCompiledTransactionMessageEncoder().encode({version:'legacy',lifetimeToken:latest.value.blockhash,
  header:{numSignerAccounts:1,numReadonlySignerAccounts:0,numReadonlyNonSignerAccounts:1},
  staticAccounts:[payer,'11111111111111111111111111111111'],instructions:[{programAddressIndex:1,accountIndices:[0,0],data:transfer}]}));
const fee=await rpc('getFeeForMessage',[message.toString('base64'),{commitment:'confirmed',minContextSlot:latest.context.slot}]);
assert(Number.isSafeInteger(fee.value) && fee.value>0);
const result=await rpc('simulateTransaction',[Buffer.concat([Buffer.from([1]),Buffer.alloc(64),message]).toString('base64'),
  {encoding:'base64',sigVerify:false,replaceRecentBlockhash:false,commitment:'confirmed',minContextSlot:fee.context.slot,
    accounts:{encoding:'base64',addresses:[payer]}}]);
assert.equal(result.value.err,null,JSON.stringify(result.value.err));
assert.equal(before.value.lamports-result.value.accounts[0].lamports,fee.value,'Simulation must deduct the fee from returned payer account');
const unchanged=await rpc('getAccountInfo',[payer,{commitment:'confirmed',encoding:'base64',minContextSlot:result.context.slot}]);
assert.equal(unchanged.value.lamports,before.value.lamports,'Read-only probe must not change on-chain funds');
console.log(JSON.stringify({network:'devnet',fee:fee.value,simulationDeductsFee:true,onChainBalanceUnchanged:true,submitted:false}));
