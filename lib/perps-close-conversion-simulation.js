// Exact-wire conversion effects only. Does not prove that the input belongs to
// a recorded finalized close, mutate risk, authorize a signer or send anything.
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {readConstructedPerpsCloseConversionWire,minimumPerpsConversionUsdcUnits} from './perps-close-conversion-wire.js';
import {canonicalServerPerpsSimulationSnapshot} from './perps-server-simulation.js';
import {readPerpsCloseLegacyToken} from './perps-server-close-funding.js';
import {PERPS_PROGRAM,PERPS_POOL,decodeServerPerpsCustody,deriveServerPerpsIdentities,requireDecodedServerPerpsCustody} from './perps-server-custody.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',SYSTEM='11111111111111111111111111111111',DOVES='DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e';
const proofs=new WeakMap();
function fail(reason='UNVERIFIED_PERPS_CONVERSION_SIMULATION'){throw Error(reason);}
function integer(n){if(!Number.isSafeInteger(n)||n<0)fail();return n;}
const lam=a=>BigInt(a?.lamports??'0');
function bytes(a){if(!a||a.executable)fail();return Buffer.from(a.data[0],'base64');}
const vacant=a=>a===null||a.owner===SYSTEM&&!a.executable&&a.data[0]==='';
const closed=a=>vacant(a)&&lam(a)===0n;
function unchanged(a,b){if(JSON.stringify(a)!==JSON.stringify(b))fail();}
function stableToken(a,b,nativeDelta=0n){
 const x=bytes(a),y=bytes(b);x.fill(0,64,72);y.fill(0,64,72);
 if(a.owner!==b.owner||lam(b)-lam(a)!==nativeDelta||!x.equals(y))fail();
}
export function readSimulatedPerpsCloseConversion(value){
 const p=proofs.get(value);if(!p)fail();readConstructedPerpsCloseConversionWire(p.wire);
 const elapsed=p.monotonicNow()-p.started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000)fail();return p;
}
// A decoder, not standalone chain provenance or signing authority. Callers
// must independently fetch the native account under the expected bank/network.
export async function decodePerpsConversionOracleBounds(c,a,{nowSeconds}={}){
 requireDecodedServerPerpsCustody(c);integer(nowSeconds);
 if(!a||a.owner!==DOVES||a.executable)fail();
 const d=bytes(a),[derived,bump]=await getProgramDerivedAddress({programAddress:DOVES,seeds:['ag_feed',bs58.decode(c.mint)]});
 if(d.length<266||d.subarray(0,8).toString('hex')!=='70f98bd9d7d0f936'||bs58.encode(d.subarray(8,40))!==c.mint||c.dovesAgOracle!==derived||d[201]!==bump)fail();
 const raw=d.readBigUInt64LE(168),expo=d.readInt8(176),time=d.readBigInt64LE(177),maxAge=d.readUInt32LE(185);
 if(raw<=0n||expo>0||expo< -18||maxAge<1||maxAge>3600||time>BigInt(nowSeconds)+2n||time<BigInt(nowSeconds)-BigInt(Math.min(maxAge,30)))fail();
 const shift=6+expo,n=shift>=0?raw*10n**BigInt(shift):raw,den=shift>=0?1n:10n**BigInt(-shift);
 return Object.freeze({priceLowerUsdUnits:(n/den).toString(),priceUpperUsdUnits:((n+den-1n)/den).toString(),timestampSeconds:time.toString()});
}
export async function simulatePerpsCloseConversion(wire,{request,minimumSlot=0,maxSlippageBps,now=Date.now,monotonicNow=()=>performance.now()}={}){
 const {collateral,usdc}=readConstructedPerpsCloseConversionWire(wire);
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function'||!Number.isInteger(maxSlippageBps)||maxSlippageBps<1||maxSlippageBps>100)fail();
 integer(minimumSlot);const started=monotonicNow();if(!Number.isFinite(started))fail();
 const fresh=()=>{const e=monotonicNow()-started;if(!Number.isFinite(e)||e<0||e>10000)fail();};
 const addresses=[wire.walletAddress,wire.source,wire.destination,PERPS_POOL,collateral.address,collateral.tokenAccount,usdc.address,usdc.tokenAccount,collateral.dovesAgOracle,usdc.dovesAgOracle];
 if(new Set(addresses).size!==addresses.length)fail();
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 let slot=integer(await request('getSlot',[{commitment:'confirmed',minContextSlot:minimumSlot}]));if(slot<minimumSlot)fail();
 const height=async()=>{const h=integer(await request('getBlockHeight',[{commitment:'confirmed',minContextSlot:slot}]));if(BigInt(h)>BigInt(wire.lastValidBlockHeight))fail();};
 await height();
 const feeReply=await request('getFeeForMessage',[wire.messageBase64,{commitment:'confirmed',minContextSlot:slot}]);
 if(integer(feeReply?.context?.slot)<slot)fail();slot=feeReply.context.slot;
 const fee=integer(feeReply.value),priority=(BigInt(wire.computeUnitLimit)*BigInt(wire.computeUnitPriceMicroLamports)+999999n)/1000000n;
 if(fee<1||fee>1000000||BigInt(fee)<priority)fail();
 let before,after,used,attempts=0;
 for(let i=0;i<3;i++){
  fresh();const [b,a]=await Promise.all([
   request('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'confirmed',minContextSlot:slot}]),
   request('simulateTransaction',[wire.serializedTxBase64,{encoding:'base64',commitment:'confirmed',sigVerify:false,replaceRecentBlockhash:false,minContextSlot:slot,accounts:{encoding:'base64',addresses}}])
  ]);attempts++;
  const bs=integer(b?.context?.slot),as=integer(a?.context?.slot);if(bs<slot||as<slot||!a?.value)fail();
  if(a.value.err!==null){if(a.value.err?.InstructionError?.[1]?.Custom===6020)fail('PERPS_CONVERSION_MINIMUM_NOT_MET');fail();}
  if(a.value.replacementBlockhash!=null)fail();used=integer(a.value.unitsConsumed);if(used<1||used>wire.computeUnitLimit)fail();
  slot=Math.max(bs,as);if(bs!==as)continue;
  before=canonicalServerPerpsSimulationSnapshot(addresses,b.value);after=canonicalServerPerpsSimulationSnapshot(addresses,a.value.accounts);break;
 }
 if(!before||!after)fail('PERPS_CONVERSION_SNAPSHOT_BANK_CHANGED');
 const at=Math.floor(integer(now())/1000);
 async function oracle(c){
  const key=c.dovesAgOracle,a=before[key],b=after[key];unchanged(a,b);
  return decodePerpsConversionOracleBounds(c,a,{nowSeconds:at});
 }
 const inputPrice=await oracle(collateral),usdcPrice=await oracle(usdc);
 const independentMinimum=minimumPerpsConversionUsdcUnits({amountUnits:wire.amountUnits,inputDecimals:collateral.decimals,inputPriceLowerUsdUnits:inputPrice.priceLowerUsdUnits,usdcPriceUpperUsdUnits:usdcPrice.priceUpperUsdUnits,maxSlippageBps});
 if(BigInt(wire.minimumUsdcUnits)<BigInt(independentMinimum))fail('PERPS_CONVERSION_ORACLE_MINIMUM');
 const poolTag=createHash('sha256').update('account:Pool').digest().subarray(0,8);
 for(const a of [before[PERPS_POOL],after[PERPS_POOL]])if(!a||a.owner!==PERPS_PROGRAM||a.executable||!bytes(a).subarray(0,8).equals(poolTag))fail();
 if(lam(before[PERPS_POOL])!==lam(after[PERPS_POOL])||bytes(before[PERPS_POOL]).length!==bytes(after[PERPS_POOL]).length)fail();
 for(const c of [collateral,usdc]){
  const a=before[c.address],b=after[c.address],x=bytes(a),y=bytes(b);
  if(JSON.stringify(decodeServerPerpsCustody(c.asset,c.address,a))!==JSON.stringify(c)||JSON.stringify(decodeServerPerpsCustody(c.asset,c.address,b))!==JSON.stringify(c)
   ||lam(a)!==lam(b)||x.length!==y.length||!x.subarray(0,214).equals(y.subarray(0,214)))fail();
  for(const offset of [230,238,246,254])if(x.readBigUInt64LE(offset)!==y.readBigUInt64LE(offset))fail();
 }
 const owner=wire.walletAddress,ids=await deriveServerPerpsIdentities({walletAddress:owner,asset:wire.asset,side:'LONG'}),input=BigInt(wire.amountUnits);
 const token=(a,o,m)=>readPerpsCloseLegacyToken(a,o,m);
 function vault(c){
  const a=before[c.tokenAccount],b=after[c.tokenAccount],delta=token(b,ids.transferAuthority,c.mint)-token(a,ids.transferAuthority,c.mint);
  stableToken(a,b,c.asset==='SOL'?delta:0n);return delta;
 }
 const sourceVaultCredit=vault(collateral),usdcVaultDebit=-vault(usdc);
 if(sourceVaultCredit!==input||usdcVaultDebit<BigInt(wire.minimumUsdcUnits))fail();
 let locked=0n,refund=0n;
 async function created(key,mint){
  const a=before[key],b=after[key],minimum=integer(await request('getMinimumBalanceForRentExemption',[165,{commitment:'confirmed'}]));
  if(!vacant(a)||minimum<1||minimum>10000000||lam(b)!==(lam(a)>BigInt(minimum)?lam(a):BigInt(minimum)))fail();
  if(mint===collateral.mint&&collateral.asset==='SOL'&&bytes(b).readBigUInt64LE(113)!==BigInt(minimum))fail();
  token(b,owner,mint);locked+=lam(b)-lam(a);
 }
 const oldDestination=vacant(before[wire.destination])?0n:token(before[wire.destination],owner,usdc.mint),newDestination=token(after[wire.destination],owner,usdc.mint);
 if(newDestination-oldDestination!==usdcVaultDebit)fail();
 if(vacant(before[wire.destination]))await created(wire.destination,usdc.mint);else stableToken(before[wire.destination],after[wire.destination]);
 const a=before[wire.source],b=after[wire.source],oldTokens=vacant(a)?0n:token(a,owner,collateral.mint);
 if(wire.closeWrappedAccount){
  if(!wire.nativeSolInput||oldTokens!==0n||!closed(b)||!vacant(a)&&lam(a)!==bytes(a).readBigUInt64LE(113))fail();refund+=lam(a);
 }else{
  const next=token(b,owner,collateral.mint),synced=wire.nativeSolInput&&!vacant(a)?lam(a)-bytes(a).readBigUInt64LE(113):oldTokens;
  const expected=wire.nativeSolInput?synced:oldTokens-input;
  if(expected<0n||next!==expected)fail();
  if(vacant(a)){if(!wire.nativeSolInput)fail();await created(wire.source,collateral.mint);}
  else stableToken(a,b,wire.asset==='SOL'&&!wire.nativeSolInput?-input:0n);
 }
 for(const a of [before[owner],after[owner]])if(!a||a.owner!==SYSTEM||a.executable||a.data[0]!=='')fail();
 const change=lam(after[owner])-lam(before[owner]);
 if(locked>20000000n||change!==refund-locked-BigInt(fee)-(wire.nativeSolInput?input:0n))fail();
 await height();if(await request('getGenesisHash',[])!==GENESIS)fail();fresh();
 const result=Object.freeze({stage:'PROTECTED_CONVERSION_EFFECTS_SIMULATED',readyForSigning:false,tradingEnabled:false,walletAddress:owner,
  amountUnits:wire.amountUnits,minimumUsdcUnits:wire.minimumUsdcUnits,independentMinimumUsdcUnits:independentMinimum,receivedUsdcUnits:usdcVaultDebit.toString(),
  networkFeeLamports:String(fee),rentLockedLamports:locked.toString(),rentRefundedLamports:refund.toString(),walletSolChangeLamports:change.toString(),observedSlot:slot,snapshotBankAttempts:attempts,
  requiresFinalizedProceedsAndJournalBinding:true,requiresFreshSigningRevalidation:true,requiresExplicitAuthorization:true});
 proofs.set(result,Object.freeze({wire,before,after,addresses:Object.freeze(addresses),started,monotonicNow}));return result;
}
