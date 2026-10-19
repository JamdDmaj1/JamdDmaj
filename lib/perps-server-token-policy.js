// Top-level setup/cleanup policy. Not chain-state, CPI or signing authorization.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {checkServerPerpsCapabilities} from './perps-server-capabilities.js';
import {PERPS_PROGRAM,PERPS_CUSTODIES,deriveServerPerpsIdentities} from './perps-server-custody.js';
import {decodeServerPerpsPreSwap} from './perps-server-preswap.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111';
function fail(){throw Error('UNSUPPORTED_PERPS_TOKEN_SETUP');}
async function associated(owner,mint){return (await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(owner),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];}
export async function checkServerPerpsTokenPolicy(inspection,intent){
 const envelope=inspection?.envelope,keys=inspection?.resolvedKeys;
 checkServerPerpsCapabilities(envelope);
 if(!['BTC','ETH','SOL'].includes(intent?.asset)||!['LONG','SHORT'].includes(intent.side)||!Array.isArray(keys)||keys.length!==envelope.accountCount||keys[0]!==intent.walletAddress)fail();
 for(let i=0;i<envelope.staticKeys.length;i++)if(envelope.staticKeys[i]!==keys[i])fail();
 const writable=index=>index<3?index<3-envelope.readonlySigned:index<envelope.staticKeys.length?index<envelope.staticKeys.length-envelope.readonlyUnsigned:index<envelope.staticKeys.length+envelope.lookups.reduce((n,t)=>n+t.writable.length,0);
 const source=await associated(intent.walletAddress,PERPS_CUSTODIES.USDC.mint),collateralMint=PERPS_CUSTODIES[intent.side==='LONG'?intent.asset:'USDC'].mint,collateral=await associated(intent.walletAddress,collateralMint);
 const allowed=new Map([[source,[intent.walletAddress,PERPS_CUSTODIES.USDC.mint]],[collateral,[intent.walletAddress,collateralMint]]]);
 const position=(await deriveServerPerpsIdentities(intent)).position;
 for(const ix of envelope.instructions){
  if(envelope.staticKeys[ix.program]!==PERPS_PROGRAM)continue;
  const b=Buffer.from(ix.dataBase64,'base64'),tag=b.subarray(0,8).toString('hex');
  if(['e455b9704e4f4d02','c52656a5c71726ea'].includes(tag)){decodeServerPerpsPreSwap(ix.dataBase64);continue;}
  if(tag==='7562427f1e3249b9'){
   if(b.length!==50)fail();const [exit]=await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position_request',bs58.decode(position),b.subarray(34,42),new Uint8Array([2])]});
   allowed.set(await associated(exit,PERPS_CUSTODIES.USDC.mint),[exit,PERPS_CUSTODIES.USDC.mint]);
  }else if(tag!=='a47e44b6dfa640b7')fail();
 }
 const created=new Set();let cleanupCount=0;
 for(const ix of envelope.instructions){
  const program=envelope.staticKeys[ix.program],b=Buffer.from(ix.dataBase64,'base64'),indices=ix.accounts;
  if(indices.some(i=>!Number.isInteger(i)||i<0||i>=keys.length))fail();
  const roles=indices.map(i=>keys[i]);
  if(program===TOKEN){
   if(b.length!==1)fail();
   if(b[0]===9){
    if(indices.length!==3||indices[1]!==0||indices[2]!==0||!writable(indices[0])||![source,collateral].includes(roles[0]))fail();
   }else if(b[0]===17){
    if(intent.side!=='LONG'||intent.asset!=='SOL'||indices.length!==1||!writable(indices[0])||roles[0]!==collateral)fail();
   }else fail();
   cleanupCount++;
  }else if(program===ATA){
   if(indices.length!==6||b.length!==1||b[0]!==1||indices[0]!==0||indices[1]<3||!writable(indices[1]))fail();
   const expected=allowed.get(roles[1]);
   if(!expected||created.has(roles[1])||roles[2]!==expected[0]||roles[3]!==expected[1]||roles[4]!==SYSTEM||roles[5]!==TOKEN)fail();
   for(const role of [3,4,5])if(indices[role]<3||writable(indices[role]))fail();created.add(roles[1]);
  }
 }
 return Object.freeze({stage:'TOKEN_SETUP_ONLY',readyForSigning:false,source,collateral,createdAccounts:Object.freeze([...created]),cleanupCount,requiresVerifiedCustodies:true,requiresExactFundingSimulation:true});
}
