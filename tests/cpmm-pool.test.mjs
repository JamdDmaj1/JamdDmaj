import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSigner,getAddressEncoder,getTransactionDecoder,getTransactionEncoder,getBase58Decoder,partiallySignTransactionWithSigners} from '@solana/kit';
import {findAssociatedTokenPda,TOKEN_2022_PROGRAM_ADDRESS} from '@solana-program/token-2022';
import {poolAmount,poolUnits,depositLpAmount,cpmmAddresses,prepareCpmmPool,readCpmmResult,cpmmJournal,CPMM,USDC,TOKEN} from '../lib/cpmm-pool.js';
import {createHash} from 'node:crypto';
const enc=getAddressEncoder();
const disc=name=>new Uint8Array(createHash('sha256').update(name).digest().subarray(0,8));
const set64=(b,o,n)=>new DataView(b.buffer).setBigUint64(o,n,true);
const info=(b,owner)=>({data:[Buffer.from(b).toString('base64'),'base64'],owner,executable:false,lamports:1000000,rentEpoch:0,space:b.length});
function mintInfo(program=TOKEN){const b=new Uint8Array(82);b[44]=6;b[45]=1;set64(b,36,100000000000000n);return info(b,program);}
function tokenInfo(mint,owner,program,amount){const b=new Uint8Array(165);b.set(enc.encode(mint),0);b.set(enc.encode(owner),32);set64(b,64,amount);b[108]=1;return info(b,program);}

test('pool arithmetic is exact, bounded and never increases maximum spends',()=>{
 assert.equal(poolAmount('0.000001',6),1n);assert.equal(poolUnits(1000001n,6),'1.000001');
 assert.equal(depositLpAmount(100n,200n,1000n,1000n,1000n),99n);
 for(const x of ['-1','0','1e8','1.0000001','18446744073709551616'])assert.throws(()=>poolAmount(x,6));
 assert.throws(()=>depositLpAmount(1n,1n,1000n,1000n,1n));
});
test('review, signing, one send and rooted recovery use only intercepted RPC',async t=>{
 for(const scenario of ['create','deposit','changed-message','expired','insufficient','unsupported-mint','simulation-failure','uncertain-send','bad-receipt','wrong-network','config-changed'])await t.test(scenario,async()=>{
  const previous=globalThis.fetch,owner=await generateKeyPairSigner(),mint=await generateKeyPairSigner(),keys=await cpmmAddresses(mint.address),memory=new Map(),calls=[];
  const account={address:owner.address,chains:['solana:mainnet']};let signs=0,wire,time=1000,configReads=0;
  const journal=cpmmJournal({getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)});
  const wallet={accounts:[account],features:{'solana:signTransaction':{supportedTransactionVersions:[0],async signTransaction({transaction,chain}){
   signs++;assert.equal(chain,'solana:mainnet');let tx=getTransactionDecoder().decode(transaction);
   if(scenario==='changed-message'){const messageBytes=new Uint8Array(tx.messageBytes);messageBytes[messageBytes.length-1]^=1;tx={...tx,messageBytes};}
   return [{signedTransaction:getTransactionEncoder().encode(await partiallySignTransactionWithSigners([owner],tx))}];
  }}}};
  const first=keys.token0===mint.address,p0=first?TOKEN_2022_PROGRAM_ADDRESS:TOKEN,p1=first?TOKEN:TOKEN_2022_PROGRAM_ADDRESS;
  const [source0]=await findAssociatedTokenPda({owner:owner.address,mint:keys.token0,tokenProgram:p0});
  const [source1]=await findAssociatedTokenPda({owner:owner.address,mint:keys.token1,tokenProgram:p1});
  const [lpAccount]=await findAssociatedTokenPda({owner:owner.address,mint:keys.lpMint,tokenProgram:TOKEN});
  const bConfig=new Uint8Array(236);bConfig.set(disc('account:AmmConfig'));set64(bConfig,12,2500n);set64(bConfig,36,150000000n);
  const bPool=new Uint8Array(637);bPool.set(disc('account:PoolState'));
  [keys.config,owner.address,keys.vault0,keys.vault1,keys.lpMint,keys.token0,keys.token1,p0,p1,keys.observation].forEach((a,i)=>bPool.set(enc.encode(a),8+i*32));
  bPool[330]=9;bPool[331]=6;bPool[332]=6;set64(bPool,333,10000000000n);
  const amount0=first?1000000000000n:1000000000n,amount1=first?1000000000n:1000000000000n,bal=10000000000000n;
  const lpMin=scenario==='deposit'?depositLpAmount(amount0,amount1,1000000000000n,1000000000n,10000000000n):31622776501n;
  globalThis.fetch=async(url,options)=>{
   assert.equal(String(url),'https://solana-rpc.publicnode.com');const q=JSON.parse(options.body);calls.push(q.method);let result;
   if(q.method==='getGenesisHash')result=scenario==='wrong-network'?'wrong':'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
   else if(q.method==='getAccountInfo'){
    let value=null;const a=q.params[0];
    if(a===mint.address){value=mintInfo(TOKEN_2022_PROGRAM_ADDRESS);if(scenario==='unsupported-mint'){const b=new Uint8Array(171);b.set(Buffer.from(value.data[0],'base64'));b[165]=1;b[166]=14;b[168]=1;value=info(b,TOKEN_2022_PROGRAM_ADDRESS);}}
    else if(a===USDC)value=mintInfo();
    else if(a===keys.config){configReads++;const b=bConfig.slice();if(scenario==='config-changed'&&configReads>1)b[12]^=1;value=info(b,CPMM);}
    else if(a===source0)value=tokenInfo(keys.token0,owner.address,p0,scenario==='insufficient'?1n:bal);
    else if(a===source1)value=tokenInfo(keys.token1,owner.address,p1,bal);
    else if(a===keys.pool&&(scenario==='deposit'||wire))value=info(bPool,CPMM);
    else if(a===keys.vault0)value=tokenInfo(keys.token0,keys.authority,p0,1000000000000n);
    else if(a===keys.vault1)value=tokenInfo(keys.token1,keys.authority,p1,1000000000n);
    result={context:{slot:1},value};
   }else if(q.method==='getLatestBlockhash')result={context:{slot:1},value:{blockhash:'11111111111111111111111111111111',lastValidBlockHeight:1000}};
   else if(q.method==='simulateTransaction')result={context:{slot:1},value:{err:scenario==='simulation-failure'?{}:null,fee:5600,preBalances:[1000000000],postBalances:[800000000],
    preTokenBalances:[{accountIndex:3,mint:keys.token0,owner:owner.address,uiTokenAmount:{amount:bal.toString(),decimals:6}},{accountIndex:4,mint:keys.token1,owner:owner.address,uiTokenAmount:{amount:bal.toString(),decimals:6}}],
    postTokenBalances:[{accountIndex:3,mint:keys.token0,owner:owner.address,uiTokenAmount:{amount:(bal-amount0).toString(),decimals:6}},{accountIndex:4,mint:keys.token1,owner:owner.address,uiTokenAmount:{amount:(bal-amount1).toString(),decimals:6}},{accountIndex:5,mint:keys.lpMint,owner:owner.address,uiTokenAmount:{amount:lpMin.toString(),decimals:9}}]}};
   else if(q.method==='sendTransaction'){assert.ok(journal.read());assert.equal(q.params[1].maxRetries,0);if(scenario==='uncertain-send')throw Error('UNCERTAIN');wire=q.params[0];result=getBase58Decoder().decode(getTransactionDecoder().decode(Buffer.from(wire,'base64')).signatures[owner.address]);}
   else if(q.method==='getSignatureStatuses')result={context:{slot:1},value:[{err:null,confirmationStatus:'finalized'}]};
   else if(q.method==='getTransaction')result={slot:1,transaction:[wire,'base64'],meta:{err:null,preTokenBalances:[],postTokenBalances:[{accountIndex:5,mint:keys.lpMint,owner:owner.address,uiTokenAmount:{amount:scenario==='bad-receipt'?'1':lpMin.toString(),decimals:9}}]}};
   else throw Error('Unexpected RPC '+q.method);
   return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}),{headers:{'Content-Type':'application/json'}});
  };
  try{
   const prepare=()=>prepareCpmmPool({mint:mint.address,tokenAmount:'1000000',usdcAmount:'1000',wallet,account,journal,now:()=>time});
   if(['insufficient','unsupported-mint','simulation-failure','wrong-network'].includes(scenario)){await assert.rejects(prepare());assert.equal(signs,0);return;}
   const c=await prepare();assert.equal(signs,0);assert.equal(c.review.locked,false);assert.equal(c.review.buyFeeEnabled,false);
   await assert.rejects(c.approveAndSubmit(),/APPROVAL/);assert.equal(signs,0);
   if(scenario==='expired')time=50000;
   if(['expired','changed-message','config-changed','uncertain-send'].includes(scenario)){
    await assert.rejects(c.approveAndSubmit({explicitApproval:true}));assert.equal(calls.filter(x=>x==='sendTransaction').length,scenario==='uncertain-send'?1:0);
    assert.equal(Boolean(journal.read()),scenario==='uncertain-send');return;
   }
   await c.approveAndSubmit({explicitApproval:true});assert.ok(journal.read());await assert.rejects(prepare(),/PENDING/);
   if(scenario==='bad-receipt'){await assert.rejects(readCpmmResult(journal),/RECEIPT/);assert.ok(journal.read());}
   else{assert.equal((await readCpmmResult(journal)).state,'confirmed');assert.equal(journal.read(),null);}
   await assert.rejects(c.approveAndSubmit({explicitApproval:true}),/CONSUMED/);assert.equal(calls.filter(x=>x==='sendTransaction').length,1);
  }finally{globalThis.fetch=previous;}
 });
});
