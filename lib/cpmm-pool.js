import {address,getAddressEncoder,getAddressDecoder,getProgramDerivedAddress,createSolanaRpc,createTransactionMessage,setTransactionMessageFeePayer,setTransactionMessageLifetimeUsingBlockhash,appendTransactionMessageInstructions,compileTransaction,getTransactionEncoder,getTransactionDecoder,getBase64Decoder} from '@solana/kit';
import {TOKEN_2022_PROGRAM_ADDRESS,findAssociatedTokenPda,getCreateAssociatedTokenIdempotentInstructionAsync} from '@solana-program/token-2022';
import {fairLaunchComputeBudget} from './solana-devnet-token.js';
import {assertFairLaunchMessage,fairLaunchOwnerSignature} from './fair-launch-transaction.js';
import {TOKEN_CREATOR_RPC} from './token-creator.js';

// Raydium CPMM public ABI. No API-supplied instructions or arbitrary programs.
export const CPMM=address('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
export const USDC=address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const TOKEN=address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA=address('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const SYSTEM=address('11111111111111111111111111111111');
const RENT=address('SysvarRent111111111111111111111111111111111');
const FEE=address('DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8');
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const CHAIN='solana:mainnet',KEY='jamd.cpmm.pending.v1',MAX=18446744073709551615n;
const enc=getAddressEncoder(),dec=getAddressDecoder(),utf=new TextEncoder();
const reject=code=>{throw Error(code);};
const eq=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const pk=(b,o)=>dec.decode(b.slice(o,o+32));
const u64=(b,o)=>new DataView(b.buffer,b.byteOffset,b.byteLength).getBigUint64(o,true);
const meta=(a,role=0)=>({address:a,role});
async function hash(bytes){return new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));}
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
async function discriminator(name){return (await hash(utf.encode(name))).slice(0,8);}
async function pda(...seeds){return (await getProgramDerivedAddress({programAddress:CPMM,seeds:seeds.map(x=>typeof x==='string'?utf.encode(x):x)}))[0];}
export function poolAmount(text,decimals){
 if(typeof text!=='string'||! /^(0|[1-9][0-9]{0,19})(\.[0-9]+)?$/.test(text)||!Number.isInteger(decimals)||decimals<0||decimals>9)reject('POOL_AMOUNT');
 const [whole,frac='']=text.split('.');if(frac.length>decimals)reject('POOL_PRECISION');
 const n=BigInt(whole)*10n**BigInt(decimals)+BigInt(frac.padEnd(decimals,'0')||'0');
 if(n<=0n||n>MAX)reject('POOL_AMOUNT');return n;
}
export function poolUnits(n,decimals){n=BigInt(n);const d=10n**BigInt(decimals);return `${n/d}${decimals?'.'+(n%d).toString().padStart(decimals,'0'):''}`;}
export async function cpmmAddresses(mint){
 mint=address(mint);if(mint===USDC)reject('POOL_IDENTICAL_MINT');
 const mintFirst=enc.encode(mint).findIndex((v,i)=>v!==enc.encode(USDC)[i]);
 const token0=enc.encode(mint)[mintFirst]<enc.encode(USDC)[mintFirst]?mint:USDC;
 const token1=token0===mint?USDC:mint;
 const config=await pda('amm_config',new Uint8Array([0,0]));
 const pool=await pda('pool',enc.encode(config),enc.encode(token0),enc.encode(token1));
 return Object.freeze({config,pool,token0,token1,authority:await pda('vault_and_lp_mint_auth_seed'),
  lpMint:await pda('pool_lp_mint',enc.encode(pool)),vault0:await pda('pool_vault',enc.encode(pool),enc.encode(token0)),
  vault1:await pda('pool_vault',enc.encode(pool),enc.encode(token1)),observation:await pda('observation',enc.encode(pool))});
}
function bytes(info){if(!info||info.executable||info.data?.[1]!=='base64')reject('POOL_ACCOUNT');return Uint8Array.from(atob(info.data[0]),c=>c.charCodeAt(0));}
function mintState(info){
 if(![TOKEN,TOKEN_2022_PROGRAM_ADDRESS].includes(info?.owner))reject('POOL_MINT_PROGRAM');
 const b=bytes(info);if(b.length<82||b[45]!==1||b[44]>9)reject('POOL_MINT');
 // This integration deliberately supports plain mints and metadata only.
 // Transfer fees/hooks/delegates/pausable/default-frozen tokens are not substituted.
 if(info.owner===TOKEN&&b.length!==82)reject('POOL_MINT');
 if(info.owner===TOKEN_2022_PROGRAM_ADDRESS&&b.length>82){
  if(b.length<166||b[165]!==1)reject('POOL_MINT');
  let o=166;const seen=new Set();while(o<b.length){if(b.slice(o).every(x=>x===0))break;if(o+4>b.length)reject('POOL_EXTENSION');
   const v=new DataView(b.buffer,b.byteOffset+o,4),kind=v.getUint16(0,true),len=v.getUint16(2,true);
   if(![18,19].includes(kind)||seen.has(kind)||o+4+len>b.length)reject('POOL_UNSUPPORTED_EXTENSION');seen.add(kind);o+=4+len;
  }
 }
 if(b.slice(0,4).some(x=>x)||b.slice(46,50).some(x=>x))reject('POOL_MINT_AUTHORITIES');
 return {program:info.owner,decimals:b[44],supply:u64(b,36)};
}
function tokenBalance(info,mint,owner,program){
 const b=bytes(info);if(info.owner!==program||b.length<165||pk(b,0)!==mint||pk(b,32)!==owner||b[108]!==1)reject('POOL_TOKEN_ACCOUNT');
 return u64(b,64);
}
async function account(rpc,key,commitment='confirmed'){return (await rpc.getAccountInfo(key,{encoding:'base64',commitment}).send()).value;}
async function network(rpc){if(await rpc.getGenesisHash().send()!==GENESIS)reject('POOL_NETWORK');}
async function configState(info){
 const b=bytes(info);if(info.owner!==CPMM||b.length!==236||!eq(b.slice(0,8),await discriminator('account:AmmConfig'))||b[9]!==0||b[10]!==0||b[11]!==0)reject('POOL_CONFIG');
 const fee=u64(b,12),creation=u64(b,36);if(fee>=1000000n||creation>1000000000n)reject('POOL_CONFIG_FEE');
 return {tradeFeePpm:fee,createFee:creation};
}
async function poolState(info,keys){
 const b=bytes(info);if(info.owner!==CPMM||b.length!==637||!eq(b.slice(0,8),await discriminator('account:PoolState')))reject('POOL_STATE');
 const expected=[keys.config,null,keys.vault0,keys.vault1,keys.lpMint,keys.token0,keys.token1,null,null,keys.observation];
 expected.forEach((p,i)=>{if(p&&pk(b,8+i*32)!==p)reject('POOL_BINDING');});
 if(b[329]&1||b[330]!==9||b[390]!==0)reject('POOL_DEPOSIT_DISABLED_OR_CREATOR_FEE');
 return {program0:pk(b,232),program1:pk(b,264),decimals0:b[331],decimals1:b[332],lpSupply:u64(b,333),
  fees0:u64(b,341)+u64(b,357)+u64(b,397),fees1:u64(b,349)+u64(b,365)+u64(b,405)};
}
export function depositLpAmount(max0,max1,reserve0,reserve1,supply){
 for(const n of [max0,max1,reserve0,reserve1,supply])if(typeof n!=='bigint'||n<=0n||n>MAX)reject('POOL_RESERVE');
 const n0=max0*supply/reserve0,n1=max1*supply/reserve1;
 const lp=(n0<n1?n0:n1)*9950n/10000n; // fixed 0.5% headroom, explicit maximum spends
 if(lp<=0n||lp>MAX)reject('POOL_LP_TOO_SMALL');return lp;
}
function wireData(prefix,...values){const b=new Uint8Array(8+values.length*8);b.set(prefix);const v=new DataView(b.buffer);values.forEach((n,i)=>v.setBigUint64(8+i*8,n,true));return b;}
function validPending(r){
 if(r?.chain!==CHAIN||!['create','deposit'].includes(r.kind)||! /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(r.signature||'')||! /^[a-f0-9]{64}$/.test(r.messageHash||'')||! /^\d{1,18}$/.test(r.lastValidBlockHeight||''))reject('POOL_JOURNAL');
 for(const k of ['owner','pool','mint','lpMint'])address(r[k]);
 if(! /^(0|[1-9][0-9]{0,19})$/.test(r.minimumLp||'')||BigInt(r.minimumLp)>MAX||BigInt(r.minimumLp)<=0n)reject('POOL_JOURNAL');return r;
}
export function cpmmJournal(storage){return {
 read(){const s=storage.getItem(KEY);return s?validPending(JSON.parse(s)):null;},
 save(r){if(this.read())reject('POOL_PENDING');validPending(r);const s=JSON.stringify(r);storage.setItem(KEY,s);if(storage.getItem(KEY)!==s)reject('POOL_STORAGE');},
 finish(signature,state){const r=this.read();if(r?.signature!==signature||!['confirmed','failed','expired'].includes(state))reject('POOL_JOURNAL');const k=KEY+'.history',h=JSON.parse(storage.getItem(k)||'[]');if(!Array.isArray(h))reject('POOL_JOURNAL');const s=JSON.stringify([...h.slice(-19),{...r,state,observedAt:Date.now()}]);storage.setItem(k,s);if(storage.getItem(k)!==s)reject('POOL_STORAGE');storage.removeItem(KEY);}
};}
export async function prepareCpmmPool({mint,tokenAmount,usdcAmount,wallet,account:ownerAccount,journal,now=Date.now}){
 const feature=wallet?.features?.['solana:signTransaction'];
 if(!feature?.signTransaction||!feature.supportedTransactionVersions?.includes(0)||!ownerAccount?.chains?.includes(CHAIN))reject('POOL_WALLET');
 if(journal.read())reject('POOL_PENDING');const rpc=createSolanaRpc(TOKEN_CREATOR_RPC);await network(rpc);
 const owner=address(ownerAccount.address),keys=await cpmmAddresses(mint);
 const [mintInfo,usdcInfo,configInfo,existing]=await Promise.all([account(rpc,address(mint)),account(rpc,USDC),account(rpc,keys.config),account(rpc,keys.pool)]);
 const token=mintState(mintInfo);
 // Canonical USDC intentionally retains mint/freeze authorities; never accept a substitute.
 const usdcBytes=bytes(usdcInfo);if(usdcInfo.owner!==TOKEN||usdcBytes.length!==82||usdcBytes[44]!==6||usdcBytes[45]!==1)reject('POOL_USDC');
 const config=await configState(configInfo),tokenUnits=poolAmount(tokenAmount,token.decimals),usdcUnits=poolAmount(usdcAmount,6);
 const tokenIs0=keys.token0===mint,amount0=tokenIs0?tokenUnits:usdcUnits,amount1=tokenIs0?usdcUnits:tokenUnits;
 const program0=tokenIs0?token.program:TOKEN,program1=tokenIs0?TOKEN:token.program;
 const [source0]=await findAssociatedTokenPda({owner,mint:keys.token0,tokenProgram:program0});
 const [source1]=await findAssociatedTokenPda({owner,mint:keys.token1,tokenProgram:program1});
 const [lpAccount]=await findAssociatedTokenPda({owner,mint:keys.lpMint,tokenProgram:TOKEN});
 const [s0,s1]=await Promise.all([account(rpc,source0),account(rpc,source1)]);
 const balance0=tokenBalance(s0,keys.token0,owner,program0),balance1=tokenBalance(s1,keys.token1,owner,program1);
 if(balance0<amount0||balance1<amount1)reject('POOL_INSUFFICIENT_TOKENS');
 const instructions=[...fairLaunchComputeBudget()];let lpMinimum,kind='create',beforeLp=0n;
 if(existing){
  kind='deposit';const state=await poolState(existing,keys);
  if(state.program0!==program0||state.program1!==program1||state.decimals0!==(tokenIs0?token.decimals:6)||state.decimals1!==(tokenIs0?6:token.decimals))reject('POOL_BINDING');
  const [v0,v1,lp]=await Promise.all([account(rpc,keys.vault0),account(rpc,keys.vault1),account(rpc,lpAccount)]);
  const r0=tokenBalance(v0,keys.token0,keys.authority,program0)-state.fees0,r1=tokenBalance(v1,keys.token1,keys.authority,program1)-state.fees1;
  lpMinimum=depositLpAmount(amount0,amount1,r0,r1,state.lpSupply);
  if(lp)beforeLp=tokenBalance(lp,keys.lpMint,owner,TOKEN);
  instructions.push(await getCreateAssociatedTokenIdempotentInstructionAsync({payer:{address:owner},owner,mint:keys.lpMint,tokenProgram:TOKEN}));
  instructions.push({programAddress:CPMM,accounts:[meta(owner,3),meta(keys.authority),meta(keys.pool,1),meta(lpAccount,1),meta(source0,1),meta(source1,1),meta(keys.vault0,1),meta(keys.vault1,1),meta(TOKEN),meta(TOKEN_2022_PROGRAM_ADDRESS),meta(keys.token0),meta(keys.token1),meta(keys.lpMint,1)],data:wireData(await discriminator('global:deposit'),lpMinimum,amount0,amount1)});
 }else{
  // The chain mints sqrt(amount0*amount1)-100 LP units; use exact integer sqrt.
  let x=amount0*amount1,y=(x+1n)/2n;while(y<x){x=y;y=(x+amount0*amount1/x)/2n;}lpMinimum=x-100n;if(lpMinimum<=0n)reject('POOL_LP_TOO_SMALL');
  instructions.push({programAddress:CPMM,accounts:[meta(owner,3),meta(keys.config),meta(keys.authority),meta(keys.pool,1),meta(keys.token0),meta(keys.token1),meta(keys.lpMint,1),meta(source0,1),meta(source1,1),meta(lpAccount,1),meta(keys.vault0,1),meta(keys.vault1,1),meta(FEE,1),meta(keys.observation,1),meta(TOKEN),meta(program0),meta(program1),meta(ATA),meta(SYSTEM),meta(RENT)],data:wireData(await discriminator('global:initialize'),amount0,amount1,0n)});
 }
 const lifetime=(await rpc.getLatestBlockhash({commitment:'confirmed'}).send()).value;
 const tx=compileTransaction(appendTransactionMessageInstructions(instructions,setTransactionMessageLifetimeUsingBlockhash(lifetime,setTransactionMessageFeePayer(owner,createTransactionMessage({version:0})))));
 const wire=getTransactionEncoder().encode(tx);if(wire.length>1232)reject('POOL_TRANSACTION_SIZE');
 const sim=(await rpc.simulateTransaction(getBase64Decoder().decode(wire),{encoding:'base64',sigVerify:false,commitment:'confirmed'}).send()).value;
 if(sim.err!==null||sim.fee==null||!sim.preBalances?.length||!sim.postBalances?.length)reject('POOL_SIMULATION');
 const total=BigInt(sim.preBalances[0])-BigInt(sim.postBalances[0]),fee=BigInt(sim.fee),creation=kind==='create'?config.createFee:0n;
 const reserves=total-fee-creation;if(reserves<0n)reject('POOL_COST');
 const afterLp=sim.postTokenBalances?.find(b=>b.mint===keys.lpMint&&b.owner===owner);
 if(!afterLp||BigInt(afterLp.uiTokenAmount.amount)-beforeLp<lpMinimum)reject('POOL_SIMULATION_LP');
 // Enforce the caps again against simulation, not only against instruction data.
 for(const [source,amount,m,bal] of [[source0,amount0,keys.token0,balance0],[source1,amount1,keys.token1,balance1]]){
  const i=sim.preTokenBalances?.find(b=>b.mint===m&&b.owner===owner);
  const o=sim.postTokenBalances?.find(b=>b.accountIndex===i?.accountIndex&&b.mint===m&&b.owner===owner);
  if(!i||!o||BigInt(i.uiTokenAmount.amount)!==bal||bal-BigInt(o.uiTokenAmount.amount)<=0n||bal-BigInt(o.uiTokenAmount.amount)>amount)reject('POOL_SIMULATION_SPEND');
 }
 const review=Object.freeze({kind,chain:CHAIN,owner,mint:address(mint),pool:keys.pool,lpMint:keys.lpMint,tokenAmount,tokenDecimals:token.decimals,usdcAmount,
  tokenBalance:poolUnits(tokenIs0?balance0:balance1,token.decimals),usdcBalance:poolUnits(tokenIs0?balance1:balance0,6),
  priceRatio:Object.freeze({usdcBaseUnits:usdcUnits.toString(),tokenBaseUnits:tokenUnits.toString(),tokenDecimals:token.decimals}),
  minimumLpBaseUnits:lpMinimum.toString(),networkFeeLamports:fee.toString(),creationFeeLamports:creation.toString(),accountReservesLamports:reserves.toString(),totalSolLamports:total.toString(),
  dexTradeFeePpm:config.tradeFeePpm.toString(),platformFee:'0',locked:false,buyFeeEnabled:false,expiresAt:now()+45000});
 let consumed=false;
 return Object.freeze({review,async approveAndSubmit({explicitApproval=false}={}){
  if(consumed)reject('POOL_REVIEW_CONSUMED');if(explicitApproval!==true)reject('POOL_APPROVAL');consumed=true;
  if(now()>=review.expiresAt||journal.read())reject('POOL_EXPIRED_OR_PENDING');
  if(!wallet.accounts?.some(a=>a.address===owner&&a.chains?.includes(CHAIN)))reject('POOL_WALLET_CHANGED');
  await network(rpc);const current=await account(rpc,keys.config);if(!eq(bytes(current),bytes(configInfo)))reject('POOL_CONFIG_CHANGED');
  const [result]=await feature.signTransaction({account:ownerAccount,chain:CHAIN,transaction:wire,options:{preflightCommitment:'confirmed'}});
  const signed=getTransactionDecoder().decode(result?.signedTransaction);assertFairLaunchMessage(tx,signed);
  if(now()>=review.expiresAt)reject('POOL_EXPIRED');const signature=fairLaunchOwnerSignature(signed,owner);
  journal.save({chain:CHAIN,kind,owner,mint:address(mint),pool:keys.pool,lpMint:keys.lpMint,signature,minimumLp:lpMinimum.toString(),messageHash:hex(await hash(signed.messageBytes)),lastValidBlockHeight:String(lifetime.lastValidBlockHeight)});
  const sent=await rpc.sendTransaction(getBase64Decoder().decode(getTransactionEncoder().encode(signed)),{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0n}).send();
  if(sent!==signature)reject('POOL_SIGNATURE_MISMATCH');return {state:'pending',signature,pool:keys.pool};
 }});
}
export async function readCpmmResult(journal){
 const r=journal.read();if(!r)return null;const rpc=createSolanaRpc(TOKEN_CREATOR_RPC);await network(rpc);
 const status=(await rpc.getSignatureStatuses([r.signature],{searchTransactionHistory:true}).send()).value[0];let state='pending';
 if(status?.confirmationStatus==='finalized'){
  const receipt=await rpc.getTransaction(r.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}).send();
  if(!receipt)return {...r,state};
  if(receipt.transaction?.[1]!=='base64'||!receipt.meta||!Object.hasOwn(receipt.meta,'err')||(receipt.meta.err===null)!==(status.err===null))reject('POOL_RECEIPT');
  const tx=getTransactionDecoder().decode(Uint8Array.from(atob(receipt.transaction[0]),c=>c.charCodeAt(0)));
  if(hex(await hash(tx.messageBytes))!==r.messageHash||fairLaunchOwnerSignature(tx,r.owner)!==r.signature)reject('POOL_RECEIPT');
  if(receipt.meta.err!==null)state='failed';else{
   const after=receipt.meta.postTokenBalances?.find(b=>b.owner===r.owner&&b.mint===r.lpMint);
   const before=receipt.meta.preTokenBalances?.find(b=>b.accountIndex===after?.accountIndex&&b.owner===r.owner&&b.mint===r.lpMint);
   if(!after||BigInt(after.uiTokenAmount.amount)-BigInt(before?.uiTokenAmount.amount||'0')<BigInt(r.minimumLp))reject('POOL_RECEIPT_LP');
   const keys=await cpmmAddresses(r.mint);if(keys.pool!==r.pool||keys.lpMint!==r.lpMint)reject('POOL_RECEIPT');
   await poolState(await account(rpc,r.pool,'finalized'),keys);state='confirmed';
  }
 }else if(status===null&&r.kind==='create'&&BigInt(await rpc.getBlockHeight({commitment:'finalized'}).send())>BigInt(r.lastValidBlockHeight)){
  const again=(await rpc.getSignatureStatuses([r.signature],{searchTransactionHistory:true}).send()).value[0];
  if(again===null&&(await account(rpc,r.pool,'finalized'))===null)state='expired';
 }
 // Deposits with missing history remain uncertain: never authorize a new spend
 // merely because a deterministic pool exists or an observation timed out.
 if(state!=='pending')journal.finish(r.signature,state);return {...r,state};
}
