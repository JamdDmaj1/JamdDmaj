import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {getAddressDecoder,getAddressEncoder,getTransactionDecoder,getCompiledTransactionMessageDecoder} from '@solana/kit';

// Read-only diagnosis of the actual pre-swap format using SOL->USDC collateral.
// NOT the production USDC-funded intent, full slippage approval or execution.
// Never signs, persists wire material or invokes transaction/execute.
const [java,classpath,wallet]=process.argv.slice(2);
if(!java||!classpath||!wallet)throw Error('Provide Java, checker classpath and public wallet');
getAddressEncoder().encode(wallet);
const decode=getAddressDecoder().decode;
const program='PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu';
async function post(url,body,headers={}){
  const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  if(!response.ok)throw Error(`Public diagnostic request failed: HTTP ${response.status}`);
  const text=await response.text();if(text.length>200000)throw Error('Oversized response');return JSON.parse(text);
}
async function rpc(method,params){const reply=await post('https://api.mainnet-beta.solana.com',{jsonrpc:'2.0',id:1,method,params});assert.equal(reply.error,undefined);return reply.result;}
const input='100000000';
const prepared=await post('https://perps-api.jup.ag/v1/positions/increase',{
  asset:'SOL',inputToken:'SOL',inputTokenAmount:input,leverage:'2',maxSlippageBps:'50',side:'short',walletAddress:wallet,
},{'x-perps-api-version':'v2'});
const message=getCompiledTransactionMessageDecoder().decode(getTransactionDecoder().decode(Buffer.from(prepared.serializedTxBase64,'base64')).messageBytes);
const keys=[...message.staticAccounts],writable=[],readonly=[],tables=message.addressTableLookups||[];
if(tables.length){
  const result=await rpc('getMultipleAccounts',[tables.map(table=>table.lookupTableAddress),{encoding:'base64',commitment:'confirmed'}]);
  assert.equal(result.value.length,tables.length);
  for(const [i,table] of tables.entries()){
    const account=result.value[i];assert.equal(account.owner,'AddressLookupTab1e1111111111111111111111111');assert.equal(account.executable,false);assert.equal(account.data[1],'base64');
    const data=Buffer.from(account.data[0],'base64');assert.equal(data.readUInt32LE(0),1);assert.equal(data.readBigUInt64LE(4),(1n<<64n)-1n);
    assert.ok(data.readBigUInt64LE(12)<=BigInt(result.context.slot));
    const usable=data.readBigUInt64LE(12)===BigInt(result.context.slot)?data[20]:(data.length-56)/32;
    for(const [indexes,target] of [[table.writableIndexes,writable],[table.readonlyIndexes,readonly]])for(const index of indexes){
      assert.ok(Number.isInteger(index)&&index>=0&&index<usable);target.push(decode(data.subarray(56+index*32,88+index*32)));
    }
  }
}
keys.push(...writable,...readonly);assert.equal(new Set(keys).size,keys.length);
const custodys=['7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz','G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa'];
const snapshots=await rpc('getMultipleAccounts',[custodys,{encoding:'base64',commitment:'confirmed'}]);
for(const account of snapshots.value){assert.equal(account.owner,program);assert.equal(account.executable,false);assert.equal(account.data[1],'base64');}
const checked=spawnSync(java,['-cp',classpath,'com.jamddmaj.ai.wallet.NativePerpsPreSwapBindingsCheck',wallet,'SOL','USDC',...snapshots.value.map(account=>account.data[0]),input,...keys],{
  input:prepared.serializedTxBase64,encoding:'utf8',timeout:30000,
});
if(checked.error||checked.status!==0)throw checked.error||Error(checked.stderr);
console.log(checked.stdout.trim());
