// Actual native-program output from the local VM, NOT mainnet finality.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
export function phoenixChildSetupReceiptFixture(){
 const f=JSON.parse(readFileSync(new URL('../fixtures/phoenix-child-setup-local-vm.json',import.meta.url),'utf8'));
 assert.equal(f.source.kind,'LOCAL_LITESVM_NATIVE_PROGRAM_EXECUTION');assert.equal(f.source.networkSubmissions,0);assert.equal(f.source.userKeysUsed,false);
 const row=f.row,tx=f.transaction,slot=tx.slot,at=Math.max(row.updated,tx.blockTime*1000)+86400000,calls=[];
 const request=async(method,params)=>{calls.push({method,params});
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSignatureStatuses'){assert.deepEqual(params[0],[row.signature]);return {context:{slot},value:[{slot,confirmationStatus:'finalized',err:tx.meta.err}]};}
  if(method==='getTransaction'){assert.equal(params[0],row.signature);return tx;}
  if(method==='getMultipleAccounts'){const w=JSON.parse(row.preparation).wire;assert.deepEqual(params[0],[w.parentAddress,w.traderAddress]);assert.equal(params[1].commitment,'finalized');return f.accounts;}
  throw Error('READ_ONLY_LOCAL_CHILD_FIXTURE');
 };
 return {...f,row,tx,calls,request,now:()=>at};
}
