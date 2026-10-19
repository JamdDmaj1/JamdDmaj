// Exact USDC pre-swap funding limits and custody bindings; never signing approval.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,requireDecodedServerPerpsCustody,checkServerPerpsCustodyBindings} from './perps-server-custody.js';
import {exactUsdUnits} from './jupiter-perps-order.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
function fail(){throw Error('PERPS_PRESWAP_INTENT_MISMATCH');}
export function decodeServerPerpsPreSwap(encoded){
 if(typeof encoded!=='string'||encoded.length>32)fail();const data=Buffer.from(encoded,'base64');
 if(data.toString('base64')!==encoded)fail();const tag=data.subarray(0,8).toString('hex');
 if(tag==='e455b9704e4f4d02'&&data.length===8)return Object.freeze({kind:'SET_LEDGER'});
 if(tag!=='c52656a5c71726ea'||data.length!==24||data.readBigUInt64LE(8)===0n||data.readBigUInt64LE(16)===0n)fail();
 return Object.freeze({kind:'PRE_SWAP',amountIn:data.readBigUInt64LE(8).toString(),minimumOut:data.readBigUInt64LE(16).toString()});
}
export function minimumServerPerpsCollateralOutput(intent,decimals){
 if(!Number.isInteger(decimals)||decimals<0||decimals>18||!Number.isInteger(intent?.maxSlippageBps)||intent.maxSlippageBps<1||intent.maxSlippageBps>100)fail();
 const margin=BigInt(exactUsdUnits(intent.marginUsd)),reference=BigInt(exactUsdUnits(intent.referencePrice));
 const denominator=reference*10000n,numerator=margin*10n**BigInt(decimals)*BigInt(10000-intent.maxSlippageBps);
 const result=(numerator+denominator-1n)/denominator;if(result<=0n||result>18446744073709551615n)fail();return result.toString();
}
async function associated(owner,mint){return (await getProgramDerivedAddress({programAddress:'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',seeds:[bs58.decode(owner),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];}
// All custody arguments must be the branded results of program-owned RPC decoding.
export async function checkServerPerpsPreSwapBindings(inspection,intent,usdc,collateral,swap,ledger,opening,encoded){
 const ids=await checkServerPerpsCustodyBindings(inspection,intent,collateral,collateral);
 requireDecodedServerPerpsCustody(usdc);
 if(!usdc||usdc.asset!=='USDC'||usdc.address!==PERPS_CUSTODIES.USDC.address||intent.side!=='LONG'||collateral.asset!==intent.asset||!usdc.allowSwap||!collateral.allowSwap)fail();
 for(const [roles,length]of [[swap,16],[ledger,3],[opening,20]])if(!Array.isArray(roles)||roles.length!==length||roles.some(k=>{try{return bs58.decode(k).length!==32;}catch{return true;}}))fail();
 const expected=[intent.walletAddress,await associated(intent.walletAddress,usdc.mint),await associated(intent.walletAddress,collateral.mint),ids.transferAuthority,ids.perpetuals,PERPS_POOL,
  usdc.address,usdc.dovesAgOracle,usdc.tokenAccount,collateral.address,collateral.dovesAgOracle,collateral.tokenAccount,TOKEN,'Sysvar1nstructions1111111111111111111111111',ids.eventAuthority,PERPS_PROGRAM];
 if(swap.some((value,i)=>value!==expected[i]))fail();
 for(const [a,b]of [[3,2],[4,4],[5,5],[10,9],[11,10],[13,11],[16,12],[18,14],[19,15]])if(opening[a]!==swap[b])fail();
 if(opening[2]!==intent.walletAddress||opening[6]!==ids.position||opening[14]!==ledger[0]||ledger[1]!==swap[2]||ledger[2]!==TOKEN||swap.includes(ledger[0])||ledger[0]===opening[6])fail();
 const data=decodeServerPerpsPreSwap(encoded),minimum=minimumServerPerpsCollateralOutput(intent,collateral.decimals);
 if(data.kind!=='PRE_SWAP'||data.amountIn!==exactUsdUnits(intent.marginUsd)||BigInt(data.minimumOut)<BigInt(minimum))fail();
 return Object.freeze({stage:'PRESWAP_BINDINGS_ONLY',readyForSigning:false,ledgerAddress:ledger[0],collateralAccount:ledger[1],amountIn:data.amountIn,minimumOut:data.minimumOut,requiredMinimumOut:minimum});
}
// Order and account capabilities are independent of the amount/binding checks.
export async function inspectServerPerpsPreSwapPlan(inspection,intent,usdc,market){
 requireDecodedServerPerpsCustody(usdc);requireDecodedServerPerpsCustody(market);
 const envelope=inspection?.envelope,keys=inspection?.resolvedKeys;
 if(envelope?.stage!=='STRUCTURE_ONLY'||!Array.isArray(keys)||keys.length!==envelope.accountCount||keys[0]!==intent?.walletAddress||!['LONG','SHORT'].includes(intent.side))fail();
 for(let i=0;i<envelope.staticKeys.length;i++)if(keys[i]!==envelope.staticKeys[i])fail();
 const writable=index=>index<3?index<3-envelope.readonlySigned:index<envelope.staticKeys.length?index<envelope.staticKeys.length-envelope.readonlyUnsigned:index<envelope.staticKeys.length+envelope.lookups.reduce((n,t)=>n+t.writable.length,0);
 const meta=(ix,role,write,sign=false)=>{const index=ix.accounts[role];if(!Number.isInteger(index)||index<0||index>=keys.length||(index<3)!==sign||writable(index)!==write)fail();};
 const roles=(ix,count)=>{if(!Array.isArray(ix.accounts)||ix.accounts.length!==count||ix.accounts.some(i=>!Number.isInteger(i)||i<0||i>=keys.length))fail();return ix.accounts.map(i=>keys[i]);};
 let ledger=null,swap=null,opening=null,swapEncoded=null,openingData=null;
 for(const ix of envelope.instructions){
  if(envelope.staticKeys[ix.program]!==PERPS_PROGRAM)continue;
  const data=Buffer.from(ix.dataBase64,'base64'),tag=data.subarray(0,8).toString('hex');
  if(['e455b9704e4f4d02','c52656a5c71726ea'].includes(tag)){
   if(opening)fail();const auxiliary=decodeServerPerpsPreSwap(ix.dataBase64);
   if(auxiliary.kind==='SET_LEDGER'){
    if(ledger||swap)fail();ledger=roles(ix,3);meta(ix,0,true);
   }else{
    if(!ledger||swap)fail();swap=roles(ix,16);swapEncoded=ix.dataBase64;if(ix.accounts[0]!==0)fail();
    for(const role of [1,2,5,6,8,9,11])meta(ix,role,true);
    for(const role of [3,4,12,13,14,15])meta(ix,role,false);
    for(const role of [7,10])if(ix.accounts[role]<3)fail();
   }
  }else if(tag==='a47e44b6dfa640b7'){
   if(opening)fail();opening=roles(ix,20);openingData=data;if(ix.accounts[2]!==0)fail();
  }else if(tag!=='7562427f1e3249b9'||!opening)fail();
 }
 if(!opening||opening[15]!==PERPS_PROGRAM||openingData[16]>1)fail();
 const collateral=openingData[16]===1;
 if(intent.side==='SHORT'){
  if(ledger||swap||!collateral||openingData.length!==42||openingData[25]!==2||openingData.readBigUInt64LE(17)!==BigInt(exactUsdUnits(intent.marginUsd))||opening[14]!==PERPS_PROGRAM||opening[3]!==await associated(intent.walletAddress,usdc.mint))fail();
  await checkServerPerpsCustodyBindings(inspection,intent,market,usdc);
  return Object.freeze({stage:'PRESWAP_PLAN_ONLY',readyForSigning:false,ledger:null,requiresFullTokenPolicy:true});
 }
 if(!ledger||!swap||collateral||openingData.length!==34||openingData[17]!==1)fail();
 const binding=await checkServerPerpsPreSwapBindings(inspection,intent,usdc,market,swap,ledger,opening,swapEncoded);
 return Object.freeze({...binding,stage:'PRESWAP_PLAN_ONLY',ledger:Object.freeze({address:ledger[0],tokenAccount:ledger[1]}),requiresLedgerState:true,requiresFullTokenPolicy:true});
}
