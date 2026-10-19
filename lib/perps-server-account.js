// One confirmed bank for the native USDC ATA, SOL payer and all six supported
// Jupiter position PDAs. Daily accounting is separate and never invented here.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {PERPS_CUSTODIES,deriveServerPerpsIdentities} from './perps-server-custody.js';
import {decodeServerPerpsPosition} from './perps-server-position.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',SYSTEM='11111111111111111111111111111111',TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const proofs=new WeakMap();
function fail(){throw Error('UNVERIFIED_SERVER_PERPS_ACCOUNT');}
function units(value){if(typeof value==='number'&&!Number.isSafeInteger(value))fail();if(!/^(0|[1-9][0-9]{0,19})$/.test(String(value)))fail();const n=BigInt(value);if(n>18446744073709551615n)fail();return n;}
function bytes(account){
 if(!account||account.executable!==false||!Array.isArray(account.data)||account.data.length!==2||account.data[1]!=='base64'||typeof account.data[0]!=='string'||account.data[0].length>5464)fail();
 units(account.lamports);const b=Buffer.from(account.data[0],'base64');if(b.length>4096||b.toString('base64')!==account.data[0])fail();return b;
}
export function requireFreshServerPerpsAccount(value,{walletAddress,minimumSlot=0}={}){
 const proof=proofs.get(value);if(!proof||value.walletAddress!==walletAddress||value.observedSlot<minimumSlot)fail();
 const age=proof.clock()-proof.started;if(!Number.isFinite(age)||age<0||age>10000)fail();return value;
}
export async function readServerPerpsAccount({walletAddress,minimumSlot=0},{request,now=Date.now,monotonicNow=()=>performance.now()}={}){
 try{if(bs58.decode(walletAddress).length!==32)fail();}catch{fail();}
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function'||!Number.isSafeInteger(minimumSlot)||minimumSlot<0)fail();
 const started=monotonicNow();if(!Number.isFinite(started))fail();
 const intents=[];for(const asset of ['BTC','ETH','SOL'])for(const side of ['LONG','SHORT'])intents.push({walletAddress,asset,side});
 const positions=await Promise.all(intents.map(deriveServerPerpsIdentities));
 const [source]=await getProgramDerivedAddress({programAddress:'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',seeds:[bs58.decode(walletAddress),bs58.decode(TOKEN),bs58.decode(PERPS_CUSTODIES.USDC.mint)]});
 const addresses=[walletAddress,source,...positions.map(p=>p.position)];if(new Set(addresses).size!==8)fail();
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 const reply=await request('getMultipleAccounts',[addresses,{commitment:'confirmed',encoding:'base64',minContextSlot:minimumSlot}]);
 if(!Number.isSafeInteger(reply?.context?.slot)||reply.context.slot<minimumSlot||!Array.isArray(reply.value)||reply.value.length!==8)fail();
 let sol=0n,available=0n,allocated=0n;const open=[];
 const payer=reply.value[0];if(payer!==null){if(payer?.owner!==SYSTEM||bytes(payer).length!==0)fail();sol=units(payer.lamports);}
 const input=reply.value[1];if(input!==null){
  const b=bytes(input);if(input.owner!==TOKEN||b.length!==165||bs58.encode(b.subarray(0,32))!==PERPS_CUSTODIES.USDC.mint||bs58.encode(b.subarray(32,64))!==walletAddress||b[108]!==1||b.readUInt32LE(72)!==0||b.readUInt32LE(109)!==0)fail();
  const close=b.readUInt32LE(129);if(close>1||(close===1&&bs58.encode(b.subarray(133,165))!==walletAddress))fail();available=b.readBigUInt64LE(64);
 }
 for(let i=0;i<6;i++){
  const account=reply.value[i+2];if(account===null)continue;
  if(account?.owner===SYSTEM&&bytes(account).length===0&&units(account.lamports)===0n)continue;
  bytes(account);const position=await decodeServerPerpsPosition(addresses[i+2],account,intents[i]);
  if(BigInt(position.sizeUsdUnits)>0n){open.push(position);allocated+=BigInt(position.collateralUsdUnits);}
 }
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 const observedAt=now(),elapsed=monotonicNow()-started;if(!Number.isSafeInteger(observedAt)||observedAt<0||!Number.isFinite(elapsed)||elapsed<0||elapsed>10000)fail();
 const result=Object.freeze({stage:'CHAIN_ACCOUNT_ONLY',readyForSigning:false,walletAddress,network:'solana-mainnet',observedAt,observedSlot:reply.context.slot,source,
  availableUsdcUnits:available.toString(),allocatedUsdcUnits:allocated.toString(),payerLamports:sol.toString(),openPositions:open.length,positions:Object.freeze(open),
  requiresReconciledDailyAccounting:true});
 proofs.set(result,{clock:monotonicNow,started});return result;
}
