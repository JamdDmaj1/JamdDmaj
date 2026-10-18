// Public custody identities/layout and position PDAs, matching native checks.
// None of these read-only checks grants custody signing or spending authority.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
export const PERPS_PROGRAM='PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu';
export const PERPS_POOL='5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',SYSTEM='11111111111111111111111111111111';
export const PERPS_CUSTODIES=Object.freeze({
 SOL:Object.freeze({address:'7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz',mint:'So11111111111111111111111111111111111111112',decimals:9,stable:false}),
 ETH:Object.freeze({address:'AQCGyheWPLeo6Qp9WpYS9m3Qj479t7R636N9ey1rEjEn',mint:'7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',decimals:8,stable:false}),
 BTC:Object.freeze({address:'5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm',mint:'3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',decimals:8,stable:false}),
 USDC:Object.freeze({address:'G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa',mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',decimals:6,stable:true})
});
const decodedCustodies=new WeakSet();
export function requireDecodedServerPerpsCustody(value){if(!decodedCustodies.has(value))fail();return value;}
function fail(){throw Error('UNVERIFIED_SERVER_PERPS_CUSTODY');}
function key(value){try{const b=bs58.decode(value);if(b.length!==32||bs58.encode(b)!==value)fail();return b;}catch{fail();}}
export function decodeServerPerpsCustody(asset,address,account){
 const expected=PERPS_CUSTODIES[asset];
 if(!expected||address!==expected.address||account?.owner!==PERPS_PROGRAM||account.executable!==false
   ||!Array.isArray(account.data)||account.data.length!==2||account.data[1]!=='base64'||typeof account.data[0]!=='string'||account.data[0].length>10924)fail();
 const data=Buffer.from(account.data[0],'base64');
 if(data.toString('base64')!==account.data[0]||data.length<416||data.length>8192||data.subarray(0,8).toString('hex')!=='01b830515d833f91'
   ||!data.subarray(8,40).equals(Buffer.from(key(PERPS_POOL)))||!data.subarray(40,72).equals(Buffer.from(key(expected.mint)))
   ||data[104]!==expected.decimals||data[105]!==Number(expected.stable)||data[138]!==2)fail();
 for(let i=199;i<206;i++)if(data[i]>1)fail();
 const maxLeverageBps=data.readBigUInt64LE(175),dovesAgOracle=bs58.encode(data.subarray(384,416));
 if(maxLeverageBps===0n||dovesAgOracle===SYSTEM)fail();
 const result=Object.freeze({...expected,asset,tokenAccount:bs58.encode(data.subarray(72,104)),oracle:bs58.encode(data.subarray(106,138)),dovesAgOracle,
  allowSwap:data[199]===1,allowIncrease:data[202]===1,allowDecrease:data[203]===1,maxLeverageBps:maxLeverageBps.toString()});
 decodedCustodies.add(result);return result;
}
export async function deriveServerPerpsIdentities({walletAddress,asset,side}){
 if(!['BTC','ETH','SOL'].includes(asset)||!['LONG','SHORT'].includes(side))fail();
 const collateral=PERPS_CUSTODIES[side==='LONG'?asset:'USDC'];
 const derive=async seeds=>(await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds}))[0];
 const [positionResult,perpetuals,eventAuthority,transferAuthority]=await Promise.all([
  getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position',key(walletAddress),key(PERPS_POOL),key(PERPS_CUSTODIES[asset].address),key(collateral.address),new Uint8Array([side==='LONG'?1:2])]}),
  derive(['perpetuals']),derive(['__event_authority']),derive(['transfer_authority'])
 ]);
 return Object.freeze({position:positionResult[0],positionBump:positionResult[1],perpetuals,eventAuthority,transferAuthority});
}
export async function checkServerPerpsCustodyBindings(inspection,intent,market,collateral){
 if(!decodedCustodies.has(market)||!decodedCustodies.has(collateral)||market.asset!==intent?.asset
   ||collateral.asset!==(intent.side==='LONG'?intent.asset:'USDC')||!market.allowIncrease||!collateral.allowIncrease)fail();
 const leverage=String(intent.leverage);if(!/^[1-9][0-9]?(\.[0-9])?$/.test(leverage))fail();
 const [whole,fraction='0']=leverage.split('.'),tenths=BigInt(whole)*10n+BigInt(fraction);
 if(tenths<11n||tenths>500n||tenths*1000n>BigInt(market.maxLeverageBps)||tenths*1000n>BigInt(collateral.maxLeverageBps))fail();
 if(inspection?.stage!=='INSPECTED_NOT_AUTHORIZED'||!Array.isArray(inspection.resolvedKeys)||inspection.resolvedKeys[0]!==intent.walletAddress)fail();
 const identities=await deriveServerPerpsIdentities(intent),envelope=inspection.envelope,keys=inspection.resolvedKeys;
 let openings=0,exits=0;
 for(const instruction of envelope.instructions){
  if(envelope.staticKeys[instruction.program]!==PERPS_PROGRAM)continue;
  const data=Buffer.from(instruction.dataBase64,'base64'),tag=data.subarray(0,8).toString('hex');
  if(['e455b9704e4f4d02','c52656a5c71726ea'].includes(tag))continue;
  const accounts=instruction.accounts.map(i=>keys[i]);
  if(accounts.length!==20||accounts[6]!==identities.position)fail();
  if(tag==='a47e44b6dfa640b7'){
   if(++openings!==1||exits)fail();
   for(const [index,value] of [[4,identities.perpetuals],[5,PERPS_POOL],[7,market.address],[8,market.dovesAgOracle],
    [10,collateral.address],[11,collateral.dovesAgOracle],[13,collateral.tokenAccount],[16,TOKEN],[17,SYSTEM],[18,identities.eventAuthority],[19,PERPS_PROGRAM]]){
    if(accounts[index]!==value)fail();
   }
   if(![market.oracle,market.dovesAgOracle].includes(accounts[9])||![collateral.oracle,collateral.dovesAgOracle].includes(accounts[12]))fail();
  }else if(tag==='7562427f1e3249b9'){
   if(openings!==1||++exits>2||data.length!==50)fail();
   const [request]=await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position_request',key(identities.position),data.subarray(34,42),new Uint8Array([2])]});
   if(accounts[7]!==request)fail();
  }else fail();
 }
 if(openings!==1)fail();
 return Object.freeze({stage:'CUSTODY_IDENTITIES_ONLY',readyForSigning:false,...identities,exitCount:exits,requiresSameWireSimulation:true,requiresFullTokenPolicy:true});
}
export async function readAndCheckServerPerpsCustodies(inspection,intent,{request}={}){
 if(typeof request!=='function'||!['BTC','ETH','SOL'].includes(intent?.asset)||!['LONG','SHORT'].includes(intent?.side)
   ||!Number.isSafeInteger(inspection?.observedSlot)||inspection.observedSlot<0)fail();
 intent=structuredClone(intent);
 const genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
 if(await request('getGenesisHash',[])!==genesis)fail();
 const assets=[intent.asset,'USDC'],addresses=assets.map(a=>PERPS_CUSTODIES[a].address);
 const snapshot=await request('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'confirmed',minContextSlot:inspection.observedSlot}]);
 if(!Number.isSafeInteger(snapshot?.context?.slot)||snapshot.context.slot<inspection.observedSlot||!Array.isArray(snapshot.value)||snapshot.value.length!==2)fail();
 const [market,usdc]=assets.map((asset,i)=>decodeServerPerpsCustody(asset,addresses[i],snapshot.value[i]));
 const collateral=intent.side==='LONG'?market:usdc;
 const identities=await checkServerPerpsCustodyBindings(inspection,intent,market,collateral);
 if(await request('getGenesisHash',[])!==genesis)fail();
 return Object.freeze({...identities,observedSlot:snapshot.context.slot,market,usdc,collateral});
}
