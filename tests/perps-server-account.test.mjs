import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {readServerPerpsAccount,requireFreshServerPerpsAccount} from '../lib/perps-server-account.js';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
const wallet=bs58.encode(Buffer.alloc(32,1)),GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
function account(owner,data,lamports=2000000){return {owner,executable:false,lamports,data:[data.toString('base64'),'base64']};}
async function fixture(){
 const b=Buffer.alloc(165);Buffer.from(bs58.decode(PERPS_CUSTODIES.USDC.mint)).copy(b);Buffer.from(bs58.decode(wallet)).copy(b,32);b.writeBigUInt64LE(5141387n,64);b[108]=1;
 const token=account('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',b);
 const intent={walletAddress:wallet,asset:'SOL',side:'SHORT'},ids=await deriveServerPerpsIdentities(intent),p=Buffer.alloc(210);
 Buffer.from('aabc8fe47a40f7d0','hex').copy(p);
 for(const [offset,key]of [[8,wallet],[40,PERPS_POOL],[72,PERPS_CUSTODIES.SOL.address],[104,PERPS_CUSTODIES.USDC.address]])Buffer.from(bs58.decode(key)).copy(p,offset);
 p.writeBigUInt64LE(1000n,136);p.writeBigUInt64LE(1001n,144);p[152]=2;p.writeBigUInt64LE(100000000n,153);p.writeBigUInt64LE(30000000n,161);p.writeBigUInt64LE(12000000n,169);p[209]=ids.positionBump;
 const reply={context:{slot:100},value:[account('11111111111111111111111111111111',Buffer.alloc(0),180000000),token,null,null,null,null,null,account(PERPS_PROGRAM,p)]};
 const calls=[],request=async(m,params)=>{calls.push({m,params});if(m==='getGenesisHash')return GENESIS;if(m==='getMultipleAccounts'){assert.equal(params[0].length,8);assert.equal(new Set(params[0]).size,8);assert.equal(params[0][7],ids.position);return reply;}throw Error('UNEXPECTED_METHOD');};
 return {reply,request,calls,token};
}
test('one chain bank binds available native USDC, SOL and all supported positions without inventing daily history',async()=>{
 const f=await fixture();let elapsed=0;const result=await readServerPerpsAccount({walletAddress:wallet,minimumSlot:99},{request:f.request,now:()=>123456,monotonicNow:()=>elapsed});
 assert.equal(result.availableUsdcUnits,'5141387');assert.equal(result.payerLamports,'180000000');assert.equal(result.allocatedUsdcUnits,'12000000');assert.equal(result.openPositions,1);
 assert.equal(result.positions[0].side,'SHORT');assert.equal(result.requiresReconciledDailyAccounting,true);assert.equal(result.lossTodayUsdcUnits,undefined);assert.equal(result.tradesToday,undefined);assert.equal(result.readyForSigning,false);
 assert.equal(f.calls.filter(c=>c.m==='getMultipleAccounts').length,1);assert.equal(requireFreshServerPerpsAccount(result,{walletAddress:wallet,minimumSlot:100}),result);
 assert.throws(()=>requireFreshServerPerpsAccount({...result},{walletAddress:wallet}));assert.throws(()=>requireFreshServerPerpsAccount(result,{walletAddress:wallet,minimumSlot:101}));
 elapsed=10001;assert.throws(()=>requireFreshServerPerpsAccount(result,{walletAddress:wallet}));
});
test('missing accounts mean zero only when explicitly absent, not malformed or partial responses',async()=>{
 const f=await fixture();f.reply.value=Array(8).fill(null);
 const value=await readServerPerpsAccount({walletAddress:wallet},{request:f.request});assert.equal(value.availableUsdcUnits,'0');assert.equal(value.openPositions,0);assert.equal(value.payerLamports,'0');
 f.reply.value[1]=undefined;await assert.rejects(readServerPerpsAccount({walletAddress:wallet},{request:f.request}));
});
test('wrong network, stale bank, delegated/frozen tokens and mismatched positions fail closed',async()=>{
 for(const mutate of [
  f=>f.reply.context.slot=98,f=>f.reply.value.pop(),f=>f.token.owner=PERPS_PROGRAM,
  f=>{const b=Buffer.from(f.token.data[0],'base64');b[108]=2;f.token.data[0]=b.toString('base64');},
  f=>{const b=Buffer.from(f.token.data[0],'base64');b[72]=1;f.token.data[0]=b.toString('base64');},
  f=>{const b=Buffer.from(f.token.data[0],'base64');b[32]^=1;f.token.data[0]=b.toString('base64');},
  f=>f.reply.value[7].owner='11111111111111111111111111111111',f=>f.reply.value[0].lamports=Number.MAX_SAFE_INTEGER+1,
 ]){const f=await fixture();mutate(f);await assert.rejects(readServerPerpsAccount({walletAddress:wallet,minimumSlot:99},{request:f.request}));}
 const f=await fixture();await assert.rejects(readServerPerpsAccount({walletAddress:wallet},{request:async()=> 'devnet'}));
 let clock=0;await assert.rejects(readServerPerpsAccount({walletAddress:wallet},{request:f.request,monotonicNow:()=>clock++===0?0:10001}));
});
