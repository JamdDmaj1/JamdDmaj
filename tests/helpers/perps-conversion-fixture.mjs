// Unfunded in-memory chain model shared by conversion and joined-flow tests.
// Every write method is rejected. This is not a live wallet or chain receipt.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {buildUnsignedPerpsCloseConversionWire,minimumPerpsConversionUsdcUnits} from '../../lib/perps-close-conversion-wire.js';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,decodeServerPerpsCustody,deriveServerPerpsIdentities} from '../../lib/perps-server-custody.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',SYSTEM='11111111111111111111111111111111',DOVES='DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',defaultWallet=bs58.encode(Buffer.alloc(32,1)),blockhash=bs58.encode(Buffer.alloc(32,9)),defaultNow=Date.parse('2026-10-20T20:00:00Z'),rent=2039280n;
export async function conversionFixture({asset='SOL',nativeSolInput=asset==='SOL',closeWrappedAccount=nativeSolInput,newSource=false,newDestination=false,oldWrapped=0n,unsynced=0n,walletAddress=defaultWallet,amountUnits='100000000',strictWire=true,nowMs=defaultNow}={}){
 const wallet=walletAddress,oracleAccounts=new Map(),now=nowMs;
 async function custody(asset){
  const c=PERPS_CUSTODIES[asset],n=['BTC','ETH','SOL','USDC'].indexOf(asset),[ag,bump]=await getProgramDerivedAddress({programAddress:DOVES,seeds:['ag_feed',bs58.decode(c.mint)]}),b=Buffer.alloc(416);
  Buffer.from('01b830515d833f91','hex').copy(b);for(const [o,k]of [[8,PERPS_POOL],[40,c.mint],[384,ag]])Buffer.from(bs58.decode(k)).copy(b,o);
  Buffer.alloc(32,30+n).copy(b,72);Buffer.alloc(32,40+n).copy(b,106);b[104]=c.decimals;b[105]=Number(c.stable);b[138]=2;b[199]=1;b.writeBigUInt64LE(500000n,175);b.writeBigUInt64LE(10000000000n,222);b.writeBigUInt64LE(1000n,230);
  const account={owner:PERPS_PROGRAM,executable:false,lamports:3000000,data:[b.toString('base64'),'base64']};
  const d=Buffer.alloc(394);Buffer.from('70f98bd9d7d0f936','hex').copy(d);Buffer.from(bs58.decode(c.mint)).copy(d,8);d[201]=bump;d.writeBigUInt64LE(asset==='USDC'?1000000n:100000000n,168);d.writeInt8(-6,176);d.writeBigInt64LE(BigInt(now/1000)-1n,177);d.writeUInt32LE(10,185);
  oracleAccounts.set(ag,{owner:DOVES,executable:false,lamports:3633120,data:[d.toString('base64'),'base64']});return {account,value:decodeServerPerpsCustody(asset,c.address,account)};
 }
 const c=await custody(asset),u=await custody('USDC'),amount=BigInt(amountUnits),quoted=amount*100000000n/10n**BigInt(c.value.decimals),received=quoted*995n/1000n;
 const minimum=minimumPerpsConversionUsdcUnits({amountUnits:String(amount),inputDecimals:c.value.decimals,inputPriceLowerUsdUnits:'100000000',usdcPriceUpperUsdUnits:'1000000',maxSlippageBps:99});
 const wire=await buildUnsignedPerpsCloseConversionWire({walletAddress:wallet,asset,amountUnits:String(amount),minimumUsdcUnits:minimum,nativeSolInput,closeWrappedAccount,blockhash,lastValidBlockHeight:'1000'},c.value,u.value);
 const ids=await deriveServerPerpsIdentities({walletAddress:wallet,asset,side:'LONG'}),before=new Map(),after=new Map();
 const system=lamports=>({owner:SYSTEM,executable:false,lamports:Number(lamports),data:['','base64']});
 function token(owner,mint,amount,extra=0n){
  const b=Buffer.alloc(165);Buffer.from(bs58.decode(mint)).copy(b);Buffer.from(bs58.decode(owner)).copy(b,32);b[108]=1;b.writeBigUInt64LE(amount,64);
  if(mint===PERPS_CUSTODIES.SOL.mint){b.writeUInt32LE(1,109);b.writeBigUInt64LE(rent,113);}
  return {owner:TOKEN,executable:false,lamports:Number(rent+(mint===PERPS_CUSTODIES.SOL.mint?amount+extra:0n)),data:[b.toString('base64'),'base64']};
 }
 const oldAmount=nativeSolInput?oldWrapped:amount+17n;
 before.set(wire.source,newSource?null:token(wallet,c.value.mint,oldAmount,asset==='SOL'?unsynced:0n));
 after.set(wire.source,closeWrappedAccount?null:token(wallet,c.value.mint,nativeSolInput?oldAmount+unsynced:17n,asset==='SOL'&&!nativeSolInput?unsynced:0n));
 before.set(wire.destination,newDestination?null:token(wallet,u.value.mint,2000n));after.set(wire.destination,token(wallet,u.value.mint,(newDestination?0n:2000n)+received));
 const locked=(newDestination?rent:0n)+(newSource&&!closeWrappedAccount?rent:0n),refunded=closeWrappedAccount&&!newSource?BigInt(before.get(wire.source).lamports):0n;
 before.set(wallet,system(20000000000n));after.set(wallet,system(20000000000n-(nativeSolInput?amount:0n)-5400n-locked+refunded));
 const poolName=Buffer.from('Jupiter'),poolCustodies=[c.value.address,u.value.address],nameLength=Buffer.alloc(4),count=Buffer.alloc(4);
 nameLength.writeUInt32LE(poolName.length);count.writeUInt32LE(poolCustodies.length);
 const pool={owner:PERPS_PROGRAM,executable:false,lamports:6000000,data:[Buffer.concat([createHash('sha256').update('account:Pool').digest().subarray(0,8),nameLength,poolName,count,...poolCustodies.map(key=>Buffer.from(bs58.decode(key))),Buffer.alloc(236)]).toString('base64'),'base64']};
 before.set(PERPS_POOL,pool);after.set(PERPS_POOL,structuredClone(pool));
 for(const x of [c,u]){before.set(x.value.address,x.account);after.set(x.value.address,structuredClone(x.account));}
 before.set(c.value.tokenAccount,token(ids.transferAuthority,c.value.mint,10000000000n,asset==='SOL'?5n:0n));after.set(c.value.tokenAccount,token(ids.transferAuthority,c.value.mint,10000000000n+amount,asset==='SOL'?5n:0n));
 before.set(u.value.tokenAccount,token(ids.transferAuthority,u.value.mint,10000000000n));after.set(u.value.tokenAccount,token(ids.transferAuthority,u.value.mint,10000000000n-received));
 for(const x of [c,u]){const account=after.get(x.value.address),data=Buffer.from(account.data[0],'base64');
  data.writeBigUInt64LE(Buffer.from(after.get(x.value.tokenAccount).data[0],'base64').readBigUInt64LE(64),222);account.data[0]=data.toString('base64');}
 for(const [k,v]of oracleAccounts){before.set(k,v);after.set(k,structuredClone(v));}
 let elapsed=0;const calls=[],response={err:null,unitsConsumed:140000},request=async(method,params)=>{
  calls.push({method,params});if(method==='getGenesisHash')return GENESIS;if(method==='getSlot')return Math.max(100,params[0].minContextSlot);if(method==='getBlockHeight')return 500;
  if(method==='getLatestBlockhash')return {context:{slot:Math.max(105,params[0].minContextSlot)},value:{blockhash,lastValidBlockHeight:1000}};
  if(method==='getFeeForMessage'){if(strictWire)assert.equal(params[0],wire.messageBase64);return {context:{slot:Math.max(101,params[1].minContextSlot)},value:5400};}
  if(method==='getMinimumBalanceForRentExemption')return Number(rent);
  if(method==='getMultipleAccounts')return {context:{slot:Math.max(105,params[1].minContextSlot)},value:params[0].map(k=>before.get(k)??null)};
  assert.equal(method,'simulateTransaction');if(strictWire)assert.equal(params[0],wire.serializedTxBase64);assert.equal(params[1].sigVerify,false);assert.equal(params[1].replaceRecentBlockhash,false);
  return {context:{slot:Math.max(105,params[1].minContextSlot)},value:{...response,accounts:params[1].accounts.addresses.map(k=>after.get(k)??null)}};
 };
 return {wire,before,after,request,calls,response,c:c.value,u:u.value,received,amount,token,walletAddress:wallet,options:{request,maxSlippageBps:100,now:()=>now,monotonicNow:()=>elapsed},expire(){elapsed=10001;}};
}
