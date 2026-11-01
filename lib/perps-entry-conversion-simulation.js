// First-leg exact-wire effects. Not an order approval, signer or finalized
// receipt. Never change the original wire/blockhash or widen the 50 bps floor.
import {createHash} from 'node:crypto';
import {readConstructedPerpsEntryConversionWire,minimumPerpsEntryCollateralUnits} from './perps-entry-conversion-wire.js';
import {canonicalServerPerpsSimulationSnapshot} from './perps-server-simulation.js';
import {decodePerpsConversionOracleBounds} from './perps-close-conversion-simulation.js';
import {readPerpsCloseLegacyToken} from './perps-server-close-funding.js';
import {PERPS_PROGRAM,PERPS_POOL,decodeServerPerpsCustody,deriveServerPerpsIdentities} from './perps-server-custody.js';
import {checkPerpsClosePoolConfiguration} from './perps-server-close-pool.js';
import {checkPerpsConversionCustodyAccrual} from './perps-conversion-custody-accrual.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',SYSTEM='11111111111111111111111111111111',proofs=new WeakMap();
function fail(code='UNVERIFIED_PERPS_ENTRY_CONVERSION_SIMULATION'){throw Error(code);}
function integer(n){if(!Number.isSafeInteger(n)||n<0)fail();return n;}
const lam=a=>BigInt(a?.lamports??'0');
function bytes(a){if(!a||a.executable)fail();return Buffer.from(a.data[0],'base64');}
const vacant=a=>a===null||a.owner===SYSTEM&&!a.executable&&a.data[0]==='';
function stableToken(a,b,nativeDelta=0n){const x=bytes(a),y=bytes(b);x.fill(0,64,72);y.fill(0,64,72);if(a.owner!==b.owner||lam(b)-lam(a)!==nativeDelta||!x.equals(y))fail();}
export function readSimulatedPerpsEntryConversion(result){const p=proofs.get(result);if(!p)fail();readConstructedPerpsEntryConversionWire(p.wire);p.fresh();return p;}
export async function simulatePerpsEntryConversion(wire,{request,minimumSlot=0,now=Date.now,monotonicNow=()=>performance.now()}={}){
 const {usdc,collateral}=readConstructedPerpsEntryConversionWire(wire);
 if([request,now,monotonicNow].some(fn=>typeof fn!=='function'))fail();integer(minimumSlot);
 const observedAt=integer(now()),started=monotonicNow();if(!Number.isFinite(started))fail();
 const fresh=()=>{const e=monotonicNow()-started;if(!Number.isFinite(e)||e<0||e>10000||now()<observedAt||now()-observedAt>10000)fail();};
 const addresses=[wire.walletAddress,wire.source,wire.destination,PERPS_POOL,usdc.address,usdc.tokenAccount,collateral.address,collateral.tokenAccount,usdc.dovesAgOracle,collateral.dovesAgOracle];
 if(new Set(addresses).size!==addresses.length||await request('getGenesisHash',[])!==GENESIS)fail();
 let slot=integer(await request('getSlot',[{commitment:'confirmed',minContextSlot:minimumSlot}]));if(slot<minimumSlot)fail();
 const height=async()=>{if(BigInt(integer(await request('getBlockHeight',[{commitment:'confirmed',minContextSlot:slot}])))>BigInt(wire.lastValidBlockHeight))fail();};await height();
 const feeReply=await request('getFeeForMessage',[wire.messageBase64,{commitment:'confirmed',minContextSlot:slot}]);
 if(integer(feeReply?.context?.slot)<slot)fail();slot=feeReply.context.slot;
 const fee=integer(feeReply.value),priority=(BigInt(wire.computeUnitLimit)*BigInt(wire.computeUnitPriceMicroLamports)+999999n)/1000000n;if(fee<1||fee>1000000||BigInt(fee)<priority)fail();let before,after,attempts=0;
 for(let attempt=0;attempt<3;attempt++){
  fresh();const [b,a]=await Promise.all([request('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'confirmed',minContextSlot:slot}]),
   request('simulateTransaction',[wire.serializedTxBase64,{encoding:'base64',commitment:'confirmed',sigVerify:false,replaceRecentBlockhash:false,minContextSlot:slot,accounts:{encoding:'base64',addresses}}])]);attempts++;
  const bs=integer(b?.context?.slot),as=integer(a?.context?.slot);if(bs<slot||as<slot||!a?.value||a.value.err!==null||a.value.replacementBlockhash!=null||integer(a.value.unitsConsumed)<1||a.value.unitsConsumed>400000)fail();
  slot=Math.max(bs,as);if(bs!==as)continue;before=canonicalServerPerpsSimulationSnapshot(addresses,b.value);after=canonicalServerPerpsSimulationSnapshot(addresses,a.value.accounts);break;
 }
 if(!before||!after)fail('PERPS_ENTRY_CONVERSION_SNAPSHOT_BANK_CHANGED');
 const oracle=async c=>{if(JSON.stringify(before[c.dovesAgOracle])!==JSON.stringify(after[c.dovesAgOracle]))fail();return decodePerpsConversionOracleBounds(c,before[c.dovesAgOracle],{nowSeconds:Math.floor(integer(now())/1000)});};
 const up=await oracle(usdc),cp=await oracle(collateral),minimum=minimumPerpsEntryCollateralUnits({usdcUnits:wire.usdcUnits,outputDecimals:collateral.decimals,usdcPriceLowerUsdUnits:up.priceLowerUsdUnits,outputPriceUpperUsdUnits:cp.priceUpperUsdUnits,maxSlippageBps:50});
 if(BigInt(wire.minimumCollateralUnits)<BigInt(minimum))fail('PERPS_ENTRY_CONVERSION_ORACLE_MINIMUM');
 const poolTag=createHash('sha256').update('account:Pool').digest().subarray(0,8);
 for(const a of [before[PERPS_POOL],after[PERPS_POOL]])if(!a||a.owner!==PERPS_PROGRAM||a.executable||!bytes(a).subarray(0,8).equals(poolTag))fail();
 if(lam(before[PERPS_POOL])!==lam(after[PERPS_POOL])||bytes(before[PERPS_POOL]).length!==bytes(after[PERPS_POOL]).length)fail();
 checkPerpsClosePoolConfiguration(before[PERPS_POOL],after[PERPS_POOL],[usdc.address,collateral.address]);
 for(const c of [usdc,collateral]){
  const a=before[c.address],b=after[c.address],x=bytes(a),y=bytes(b);
  if(JSON.stringify(decodeServerPerpsCustody(c.asset,c.address,a))!==JSON.stringify(c)||JSON.stringify(decodeServerPerpsCustody(c.asset,c.address,b))!==JSON.stringify(c))fail('PERPS_ENTRY_CONVERSION_CUSTODY_IDENTITY');
  if(lam(a)!==lam(b)||x.length!==y.length)fail('PERPS_ENTRY_CONVERSION_CUSTODY_SHAPE');
  if(!x.subarray(0,214).equals(y.subarray(0,214)))fail('PERPS_ENTRY_CONVERSION_CUSTODY_PREFIX');
  checkPerpsConversionCustodyAccrual(x,y,{nowSeconds:Math.floor(integer(now())/1000)});
  for(const offset of [230,238,246,254])if(x.readBigUInt64LE(offset)!==y.readBigUInt64LE(offset))fail();
  const interest=d=>d.readBigUInt64LE(262)+(d.readBigUInt64LE(270)<<64n);
  if(interest(y)<interest(x)||y.readBigInt64LE(278)<x.readBigInt64LE(278)||x.readBigInt64LE(278)<0n)fail();
 }
 const ids=await deriveServerPerpsIdentities({walletAddress:wire.walletAddress,asset:wire.asset,side:'LONG'}),input=BigInt(wire.usdcUnits),owner=wire.walletAddress;
 const token=(a,o,m)=>readPerpsCloseLegacyToken(a,o,m);
 function vault(c){const a=before[c.tokenAccount],b=after[c.tokenAccount],delta=token(b,ids.transferAuthority,c.mint)-token(a,ids.transferAuthority,c.mint);stableToken(a,b,c.asset==='SOL'?delta:0n);
  const total=a=>{const d=bytes(a);return d.readBigUInt64LE(214)+d.readBigUInt64LE(222);};if(total(after[c.address])-total(before[c.address])!==delta)fail();return delta;}
 const credit=vault(usdc),output=-vault(collateral);if(credit!==input||output<BigInt(wire.minimumCollateralUnits))fail();
 if(token(before[wire.source],owner,usdc.mint)-token(after[wire.source],owner,usdc.mint)!==input)fail();stableToken(before[wire.source],after[wire.source]);
 const oldDestination=before[wire.destination],next=after[wire.destination],oldAmount=vacant(oldDestination)?0n:token(oldDestination,owner,collateral.mint);
 if(token(next,owner,collateral.mint)-oldAmount!==output)fail();let locked=0n;
 if(vacant(oldDestination)){
  const rent=integer(await request('getMinimumBalanceForRentExemption',[165,{commitment:'confirmed'}]));if(rent<1||rent>10000000)fail();
  const expected=lam(oldDestination)>BigInt(rent)?lam(oldDestination):BigInt(rent);
  if(lam(next)!==expected+(wire.asset==='SOL'?output:0n))fail();locked=expected-lam(oldDestination);
  if(wire.asset==='SOL'&&bytes(next).readBigUInt64LE(113)!==BigInt(rent))fail();
 }else stableToken(oldDestination,next,wire.asset==='SOL'?output:0n);
 for(const a of [before[owner],after[owner]])if(!a||a.owner!==SYSTEM||a.executable||a.data[0]!=='')fail();
 if(lam(before[owner])-lam(after[owner])!==BigInt(fee)+locked)fail();await height();if(await request('getGenesisHash',[])!==GENESIS)fail();fresh();
 const result=Object.freeze({stage:'PROTECTED_ENTRY_CONVERSION_EFFECTS_SIMULATED',readyForSigning:false,tradingEnabled:false,walletAddress:owner,asset:wire.asset,usdcUnits:wire.usdcUnits,minimumCollateralUnits:wire.minimumCollateralUnits,
  receivedCollateralUnits:output.toString(),networkFeeLamports:String(fee),rentLockedLamports:locked.toString(),observedAt,observedSlot:slot,snapshotBankAttempts:attempts,requiresFinalizedReceiptBeforeOpening:true,requiresExplicitAuthorization:true});
 proofs.set(result,Object.freeze({wire,before,after,addresses:Object.freeze(addresses),fresh}));return result;
}
