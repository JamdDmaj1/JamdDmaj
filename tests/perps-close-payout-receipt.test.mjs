import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import layout from '../lib/perps-event-layout.json' with {type:'json'};
import {canonicalPerpsCloseSettlement} from '../lib/perps-close-settlement.js';
import {readFinalizedPerpsClosePayout,requireVerifiedPerpsClosePayout,perpsClosePayoutRecordBinding} from '../lib/perps-close-payout-receipt.js';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {readServerPerpsAccount} from '../lib/perps-server-account.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111';
const genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',now=Date.parse('2026-10-20T20:00:00Z'),rent=2039280n,payout=7000000n;
const hash=b=>createHash('sha256').update(b).digest('hex');
const associated=async(owner,mint)=>(await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(owner),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];
// Public deterministic, unfunded fixture identities. Signatures never reach an
// RPC or broadcaster; the request function below rejects every write method.
const privateKeys=[51,52,53].map(n=>createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,n)]),format:'der',type:'pkcs8'}));
const signers=privateKeys.map(k=>bs58.encode(createPublicKey(k).export({format:'der',type:'spki'}).subarray(-32)));
async function fixture({asset='SOL',side='LONG',version=1,versioned=false,newAta=false,retainedRequest=false,retainedPosition=false,entire=true,extraPerps=false,amount=7000000n}={}){
 const payout=amount;
 const wallet=signers[0],ids=await deriveServerPerpsIdentities({walletAddress:wallet,asset,side}),receiveAsset=side==='LONG'?asset:'USDC',c=PERPS_CUSTODIES[receiveAsset];
 const collateral=await associated(wallet,c.mint),vault=bs58.encode(Buffer.alloc(32,61)),oracle=bs58.encode(Buffer.alloc(32,62)),blockTime=now/1000-3;
 const native=receiveAsset==='SOL',delivery=native?'NATIVE_SOL':'TOKEN';
 const [requestAddress]=await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position_request',bs58.decode(ids.position),Buffer.from('0700000000000000','hex'),new Uint8Array([2])]});
 const requestAta=await associated(requestAddress,c.mint);
 const common=[signers[1],signers[2],wallet,collateral,ids.transferAuthority,ids.perpetuals,PERPS_POOL,ids.position,PERPS_CUSTODIES[asset].address,oracle];
 const roles=version===1?[...common,oracle,c.address,oracle,oracle,vault,c.mint,PERPS_PROGRAM,TOKEN,ATA,SYSTEM,ids.eventAuthority,PERPS_PROGRAM]
  :[...common,c.address,oracle,vault,c.mint,PERPS_PROGRAM,requestAddress,requestAta,TOKEN,ATA,SYSTEM,ids.eventAuthority,PERPS_PROGRAM];
 const keys=[...signers,...new Set([...roles,TOKEN].filter(k=>!signers.includes(k)))];
 const core=Buffer.alloc(version===1?42:50);Buffer.from(version===1?'2e17f02c1e8a5e8c':'a2bfc83e8b3eb011','hex').copy(core);
 const price=side==='LONG'?99500000n:100500000n;core.writeBigUInt64LE(price,24);core[32]=1;core[33]=Number(entire);core.writeBigInt64LE(BigInt(blockTime),34);if(version===2)core.writeBigUInt64LE(7n,42);
 const ix=(program,accounts,data)=>Buffer.concat([Buffer.from([keys.indexOf(program),accounts.length,...accounts.map(k=>keys.indexOf(k)),data.length]),data]);
 const roots=[ix(PERPS_PROGRAM,roles,core),...(extraPerps?[ix(PERPS_PROGRAM,[],Buffer.from([1]))]:[]),...(native?[ix(TOKEN,[collateral,wallet,wallet],Buffer.from([9]))]:[])];
 const message=Buffer.concat([Buffer.from(versioned?[128,3,1,0,keys.length]:[3,1,0,keys.length]),...keys.map(k=>Buffer.from(bs58.decode(k))),Buffer.alloc(32,9),Buffer.from([roots.length]),...roots,...versioned?[Buffer.from([0])]:[]]);
 const signatures=privateKeys.map(k=>sign(null,message,k)),wire=Buffer.concat([Buffer.from([3]),...signatures,message]);assert(wire.length<=1232);
 const ownerSigned=Buffer.from(wire);ownerSigned.fill(0,65,129);const unsigned=Buffer.from(wire);unsigned.fill(0,1,129);
 const schema=layout.events.find(e=>e.name==='InstantDecreasePositionEvent'),fields={};
 for(const [k,t]of schema.fields)fields[k]=typeof t==='object'?null:t==='publicKey'?wallet:t==='bool'?false:t==='u8'?0:'0';
 Object.assign(fields,{owner:wallet,pool:PERPS_POOL,positionKey:ids.position,positionSide:side==='LONG'?1:2,positionCustody:PERPS_CUSTODIES[asset].address,
  positionCollateralCustody:c.address,positionMint:PERPS_CUSTODIES[asset].mint,desiredMint:c.mint,sizeUsdDelta:'30000000',transferToken:String(payout),
  originalPositionCollateralUsd:'10000000',positionOpenTime:'1000',priceSlippage:String(price)});
 function eventBytes(){return Buffer.concat([createHash('sha256').update('event:InstantDecreasePositionEvent').digest().subarray(0,8),...schema.fields.map(([k,t])=>{
  if(typeof t==='object')return Buffer.from([0]);if(t==='publicKey')return Buffer.from(bs58.decode(fields[k]));if(t==='bool'||t==='u8')return Buffer.from([Number(fields[k])]);
  const b=Buffer.alloc(8);if(t==='i64')b.writeBigInt64LE(BigInt(fields[k]));else b.writeBigUInt64LE(BigInt(fields[k]));return b;
 })]);}
 const preBalances=keys.map(()=>1000000),postBalances=[...preBalances];
 const set=(key,a,b)=>{preBalances[keys.indexOf(key)]=Number(a);postBalances[keys.indexOf(key)]=Number(b);};
 const oldTokens=native||newAta?0n:17n;
 set(ids.position,2000000n,retainedPosition?2000000n:0n);set(collateral,newAta?0n:rent,native?0n:rent);
 set(vault,native?rent+100000000n:rent,native?rent+100000000n-payout:rent);
 if(version===2){set(requestAddress,0n,0n);set(requestAta,0n,retainedRequest?rent:0n);}
 set(wallet,100000000n,100000000n+(retainedPosition?0n:2000000n)+(native?(newAta?0n:rent)+payout:newAta?-rent:0n)-(version===2&&retainedRequest?rent:0n)-5000n);
 const token=(key,owner,amount)=>({accountIndex:keys.indexOf(key),mint:c.mint,owner,programId:TOKEN,uiTokenAmount:{amount:String(amount),decimals:c.decimals}});
 const preTokenBalances=[token(vault,ids.transferAuthority,100000000n),...newAta?[]:[token(collateral,wallet,oldTokens)]];
 const postTokenBalances=[token(vault,ids.transferAuthority,100000000n-payout),...native?[]:[token(collateral,wallet,oldTokens+payout)],...version===2&&retainedRequest?[token(requestAta,requestAddress,0n)]:[]];
 const transfer=Buffer.alloc(9);transfer[0]=3;transfer.writeBigUInt64LE(payout,1);
 const inner=[{programIdIndex:keys.indexOf(TOKEN),accounts:[keys.indexOf(vault),keys.indexOf(collateral),keys.indexOf(ids.transferAuthority)],data:bs58.encode(transfer),stackHeight:2},
  {programIdIndex:keys.indexOf(PERPS_PROGRAM),accounts:[keys.indexOf(ids.eventAuthority)],data:bs58.encode(Buffer.concat([Buffer.from('e445a52e51cb9a1d','hex'),eventBytes()])),stackHeight:2}];
 const tx={slot:300,blockTime,transaction:[wire.toString('base64'),'base64'],meta:{err:null,fee:5000,preBalances,postBalances,preTokenBalances,postTokenBalances,innerInstructions:[{index:0,instructions:inner}],loadedAddresses:{writable:[],readonly:[]}}};
 const status={slot:300,err:null,confirmationStatus:'finalized'},calls=[];
 const custodyData=Buffer.alloc(416);Buffer.from('01b830515d833f91','hex').copy(custodyData);Buffer.from(bs58.decode(PERPS_POOL)).copy(custodyData,8);
 Buffer.from(bs58.decode(c.mint)).copy(custodyData,40);Buffer.from(bs58.decode(vault)).copy(custodyData,72);custodyData[104]=c.decimals;custodyData[105]=Number(c.stable);
 Buffer.from(bs58.decode(oracle)).copy(custodyData,106);custodyData[138]=2;custodyData.writeBigUInt64LE(500000n,175);Buffer.from(bs58.decode(oracle)).copy(custodyData,384);
 const custodyAccount={owner:PERPS_PROGRAM,executable:false,lamports:3000000,data:[custodyData.toString('base64'),'base64']};
 function nativePosition(open){
  const b=Buffer.alloc(210);Buffer.from('aabc8fe47a40f7d0','hex').copy(b);
  for(const [offset,key]of [[8,wallet],[40,PERPS_POOL],[72,PERPS_CUSTODIES[asset].address],[104,c.address]])Buffer.from(bs58.decode(key)).copy(b,offset);
  b.writeBigUInt64LE(open?2000n:1000n,136);b.writeBigUInt64LE(open?2001n:1001n,144);b[152]=side==='LONG'?1:2;
  b.writeBigUInt64LE(100000000n,153);if(open){b.writeBigUInt64LE(30000000n,161);b.writeBigUInt64LE(10000000n,169);}
  b[209]=ids.positionBump;return {owner:PERPS_PROGRAM,executable:false,lamports:2000000,data:[b.toString('base64'),'base64']};
 }
 let clock=0,positionReopened=false,network=genesis;
 const request=async(method,params)=>{
  calls.push({method,params});if(method==='getGenesisHash')return network;if(method==='getSignatureStatuses')return {context:{slot:301},value:[status]};if(method==='getTransaction')return tx;
  if(method==='getMultipleAccounts'){
   assert.equal(params[1].commitment,'finalized');
   if(params[0].length===1)return {context:{slot:302},value:[custodyAccount]};
   return {context:{slot:303},value:params[0].map((key,i)=>{
    if(i===0)return {owner:SYSTEM,executable:false,lamports:postBalances[0],data:['','base64']};
    if(key===ids.position&&(positionReopened||retainedPosition))return nativePosition(positionReopened);
    return null;
   })};
  }throw Error('WRITE_OR_UNEXPECTED_RPC:'+method);
 };
 const settlement=canonicalPerpsCloseSettlement({version:2,mode:'COLLATERAL_THEN_USDC',walletAddress:wallet,positionAddress:ids.position,asset,side,receiveAsset,
  receiveMint:c.mint,receiveAccount:native?wallet:collateral,collateralAccount:collateral,delivery,estimatedCollateralUnits:side==='LONG'?'9999999':'0',
  estimatedUsdcUnits:side==='SHORT'?'9999999':'0',conversionRequired:side==='LONG',closePriceLimitUsdUnits:String(price),sizeUsdUnits:'30000000',collateralUsdUnits:'10000000',positionOpenTimeSeconds:'1000'},
 {walletAddress:wallet,positionAddress:ids.position});
 const row={id:'close-1',state:'PREPARED',wallet,position:ids.position,created:now-5000,observed_slot:100,fee_lamports:5000,unsigned_wire_hash:hash(unsigned),entries:'[{"reservation":"parent"}]',settlement};
 const identity={signature:bs58.encode(signatures[0]),wireHash:hash(ownerSigned)};
 const options={request,now:()=>now,monotonicNow:()=>clock};
 return {row,identity,options,tx,status,fields,eventBytes,inner,keys,ids,c,collateral,vault,requestAta,custodyAccount,calls,request,
  expire(){clock=10001;},reopen(){positionReopened=true;},network(value){network=value;},refreshEvent(){inner[1].data=bs58.encode(Buffer.concat([Buffer.from('e445a52e51cb9a1d','hex'),eventBytes()]));}};
}

test('finalized six-path payout receipt binds signed wire, exact event/transfer/vault/wallet and native closure, not quote estimates',async()=>{
 for(const asset of ['SOL','ETH','BTC'])for(const side of ['LONG','SHORT'])for(const version of [1,2]){
  const f=await fixture({asset,side,version,versioned:version===2}),r=await readFinalizedPerpsClosePayout(f.row,f.identity,f.options);
  assert.equal(r.receivedTokenUnits,String(payout));assert.equal(r.receiveAsset,side==='LONG'?asset:'USDC');
  assert.equal(r.requiresConversion,side==='LONG');assert.equal(r.requiresSignedCloseJournalBinding,true);assert.equal(r.readyForSigning,false);
  assert.equal(r.recordBinding,perpsClosePayoutRecordBinding(f.row));assert.equal(requireVerifiedPerpsClosePayout(r),r);
  assert.throws(()=>requireVerifiedPerpsClosePayout({...r}));f.expire();assert.throws(()=>requireVerifiedPerpsClosePayout(r));
  assert(f.calls.every(c=>!/^send|sign|requestAirdrop/.test(c.method)));
 }
});

test('new collateral ATA and retained v2 request ATA rent are distinguished from actual returned collateral',async()=>{
 for(const asset of ['SOL','ETH'])for(const newAta of [false,true]){
  const f=await fixture({asset,version:2,newAta,retainedRequest:true});
  assert.equal((await readFinalizedPerpsClosePayout(f.row,f.identity,f.options)).receivedTokenUnits,String(payout));
 }
});

test('a retained zero-sized native position is closed, while a valid reopened position cannot finalize this close workflow',async()=>{
 const f=await fixture({retainedPosition:true});
 assert.equal((await readFinalizedPerpsClosePayout(f.row,f.identity,f.options)).receivedTokenUnits,String(payout));
 f.reopen();
 const account=await readServerPerpsAccount({walletAddress:f.row.wallet},{request:f.request,now:()=>now,commitment:'finalized'});
 assert.equal(account.positions.length,1);assert.equal(account.positions[0].openTimeSeconds,'2000');
 await assert.rejects(readFinalizedPerpsClosePayout(f.row,f.identity,f.options));
});

test('even valid signatures and an exact record hash cannot turn a partial or multi-Perps wire into a whole-position receipt',async()=>{
 for(const options of [{entire:false},{extraPerps:true}]){
  const f=await fixture(options);await assert.rejects(readFinalizedPerpsClosePayout(f.row,f.identity,f.options));
 }
});

test('unfinalized, missing, failed and wrong-network results cannot start a conversion',async()=>{
 for(const state of ['confirmed','missing','failed','network']){
  const f=await fixture();
  if(state==='confirmed')f.status.confirmationStatus='confirmed';
  if(state==='missing'){const request=f.options.request;f.options.request=(m,p)=>m==='getSignatureStatuses'?{context:{slot:301},value:[null]}:request(m,p);}
  if(state==='failed'){f.status.err={InstructionError:[0,'InvalidArgument']};f.tx.meta.err=f.status.err;}
  if(state==='network')f.network('devnet');
  if(['confirmed','missing'].includes(state))assert.equal(await readFinalizedPerpsClosePayout(f.row,f.identity,f.options),null);
  else await assert.rejects(readFinalizedPerpsClosePayout(f.row,f.identity,f.options));
 }
});

test('a complete loss is a zero finalized return, never permission to convert pre-existing wallet tokens',async()=>{
 for(const asset of ['SOL','ETH']){
  const f=await fixture({asset,amount:0n});f.fields.pnlDelta='10000000';f.refreshEvent();
  const r=await readFinalizedPerpsClosePayout(f.row,f.identity,f.options);
  assert.equal(r.receivedTokenUnits,'0');assert.equal(r.requiresConversion,false);assert.equal(r.requiresProtectedConversion,false);
 }
});

test('record state is bound and caller mutations during RPC do not replace captured settlement evidence',async()=>{
 const f=await fixture(),original=perpsClosePayoutRecordBinding(f.row),request=f.options.request;
 f.options.request=async(m,p)=>{const value=await request(m,p);f.row.state='CANCELLED';return value;};
 const r=await readFinalizedPerpsClosePayout(f.row,f.identity,f.options);assert.equal(r.recordBinding,original);
 assert.throws(()=>perpsClosePayoutRecordBinding(f.row));
 await assert.rejects(readFinalizedPerpsClosePayout(f.row,f.identity,f.options));
});

test('receipt rejects wrong wire/generation/payout, invented native gains, vault authority and malformed metadata',async()=>{
 for(const mode of ['wire','position','size','generation','eventPayout','transfer','ownerGain','vaultAmount','vaultAuthority','decimals','duplicateBalance','fee','reopened','legacy','expired']){
  const f=await fixture();
  if(mode==='wire')f.row.unsigned_wire_hash='a'.repeat(64);
  if(mode==='position')f.row.position=f.row.wallet;
  if(mode==='size'){f.fields.sizeUsdDelta='29999999';f.refreshEvent();}
  if(mode==='generation'){f.fields.positionOpenTime='1001';f.refreshEvent();}
  if(mode==='eventPayout'){f.fields.transferToken='7000001';f.refreshEvent();}
  if(mode==='transfer'){const b=Buffer.from(bs58.decode(f.inner[0].data));b.writeBigUInt64LE(payout+1n,1);f.inner[0].data=bs58.encode(b);}
  if(mode==='ownerGain')f.tx.meta.postBalances[0]++;
  if(mode==='vaultAmount')f.tx.meta.postTokenBalances[0].uiTokenAmount.amount='92999999';
  if(mode==='vaultAuthority')f.tx.meta.preTokenBalances[0].owner=f.row.wallet;
  if(mode==='decimals')f.tx.meta.postTokenBalances[0].uiTokenAmount.decimals=6;
  if(mode==='duplicateBalance')f.tx.meta.preTokenBalances.push(f.tx.meta.preTokenBalances[0]);
  if(mode==='fee')f.tx.meta.fee++;
  if(mode==='reopened')f.reopen();
  if(mode==='expired'){const request=f.options.request;f.options.request=async(m,p)=>{const x=await request(m,p);f.expire();return x;};}
  if(mode==='legacy'){const v=JSON.parse(f.row.settlement);v.version=1;delete v.sizeUsdUnits;delete v.collateralUsdUnits;delete v.positionOpenTimeSeconds;f.row.settlement=canonicalPerpsCloseSettlement(v,{walletAddress:f.row.wallet,positionAddress:f.row.position});}
  await assert.rejects(readFinalizedPerpsClosePayout(f.row,f.identity,f.options),mode);
 }
});
