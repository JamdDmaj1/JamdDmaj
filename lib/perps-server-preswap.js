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
