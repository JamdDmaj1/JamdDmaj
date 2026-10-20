// Complete top-level close instruction/capability boundary. This does not
// validate oracle price payloads, protocol-state effects, durable close state,
// independent minimum return, or grant financial signing/submission authority.
import {readInspectedServerPerpsFullClose} from './perps-server-close-bindings.js';
import {PERPS_PROGRAM,PERPS_POOL} from './perps-server-custody.js';
import {readServerPerpsCloseOracleContext,CLOSE_PYTH_LAZER} from './perps-close-oracle-context.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111';
const COMPUTE='ComputeBudget111111111111111111111111111111',DOVES='DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e',ED25519='Ed25519SigVerify111111111111111111111111111';
const policies=new WeakMap();
function fail(){throw Error('UNSAFE_PERPS_CLOSE_INSTRUCTION_POLICY');}
function writable(envelope,index){
 if(index<3)return index<3-envelope.readonlySigned;
 if(index<envelope.staticKeys.length)return index<envelope.staticKeys.length-envelope.readonlyUnsigned;
 return index<envelope.staticKeys.length+envelope.lookups.reduce((sum,table)=>sum+table.writable.length,0);
}
export function readServerPerpsFullClosePolicy(value){
 const proof=policies.get(value);if(!proof)fail();readInspectedServerPerpsFullClose(proof.inspection);return proof;
}
export function checkServerPerpsFullCloseInstructionPolicy(inspection,{oracleContext=null}={}){
 const {plan,market,collateral,usdc}=readInspectedServerPerpsFullClose(inspection),{bindings,envelope,resolvedKeys:keys}=inspection;
 const owner=plan.walletAddress,keeper=keys[1],oracles=new Set([market.dovesAgOracle,collateral.dovesAgOracle,usdc.dovesAgOracle]);
 const hasOracleUpdates=envelope.instructions.some(ix=>keys[ix.program]===DOVES);
 if(hasOracleUpdates)readServerPerpsCloseOracleContext(oracleContext,inspection);
 const lazerFeeds=new Set(hasOracleUpdates?oracleContext.lazerFeeds:[]);
 const allowedWrites=new Set([owner,keeper,PERPS_POOL,plan.positionAddress,bindings.recipient,bindings.collateralAccount,
  market.address,collateral.address,usdc.address,collateral.tokenAccount,usdc.tokenAccount,...oracles,
  ...[bindings.tokenLedger,bindings.requestAddress,bindings.requestAta].filter(Boolean),...lazerFeeds,
  ...(hasOracleUpdates?[CLOSE_PYTH_LAZER.treasury]:[])]);
 for(let i=0;i<keys.length;i++)if(writable(envelope,i)&&!allowedWrites.has(keys[i]))fail();
 const targets=new Map([[bindings.recipient,[owner,usdc.mint]],[bindings.collateralAccount,[owner,collateral.mint]]]);
 if(bindings.requestAta)targets.set(bindings.requestAta,[bindings.requestAddress,collateral.mint]);
 const used=new Set(),created=new Set();let core=false,swapped=false,closedCollateral=false;
 for(let ixIndex=0;ixIndex<envelope.instructions.length;ixIndex++){
  const ix=envelope.instructions[ixIndex];
  const program=keys[ix.program],data=Buffer.from(ix.dataBase64,'base64'),roles=ix.accounts.map(index=>keys[index]);
  if(program===COMPUTE)continue; // Already bounded by the canonical inspection.
  if(program===ED25519){if(core||roles.length)fail();continue;}
  if(program===DOVES){
   if(core||ix.accounts.includes(0))fail();
   const tag=data.subarray(0,8).toString('hex');
   if(tag==='cb3b5fb0ec154999'){
    if(roles.length<7||roles.length>8||ix.accounts[0]!==1||data.length<16)fail();
    const length=data.readUInt32LE(8);if(length>1232||data.length!==16+length||data[15+length]>1)fail();
    const edIndex=data.readUInt16LE(12+length),sigIndex=data[14+length],ed=envelope.instructions[edIndex];
    if(edIndex>=ixIndex||!ed||keys[ed.program]!==ED25519)fail();
    const edData=Buffer.from(ed.dataBase64,'base64');if(edData.length<16||edData[1]!==0||edData[0]<1||edData[0]>8||sigIndex>=edData[0]||edData.length<2+14*edData[0])fail();
    const expected=[keeper,CLOSE_PYTH_LAZER.storage,CLOSE_PYTH_LAZER.treasury,CLOSE_PYTH_LAZER.program,SYSTEM,'Sysvar1nstructions1111111111111111111111111'];
    if(expected.some((key,i)=>key!==roles[i])||new Set(roles.slice(6)).size!==roles.length-6)fail();
    for(let role=0;role<roles.length;role++){
     const index=ix.accounts[role];if((index<3)!==(role===0)||writable(envelope,index)!==(role===0||role===2||role>=6))fail();
     if(role>=6&&!lazerFeeds.has(roles[role]))fail();
    }
   }else if(tag==='3d413ce5eb8efa75'){
    if(data.length!==8||roles.length!==5||ix.accounts[0]!==1)fail();
    const feed=oracleContext.feeds.find(f=>f.address===roles[1]);
    if(!feed||roles[2]!==feed.lazerFeed||roles[3]!==feed.clFeed||roles[4]!==feed.redstoneFeed)fail();
    for(let role=1;role<5;role++)if(ix.accounts[role]<3||role===1&&!writable(envelope,ix.accounts[role])||role>=3&&writable(envelope,ix.accounts[role]))fail();
   }else fail();
   continue;
  }
  if(program===ATA){
   if(data.length!==1||data[0]!==1||roles.length!==6||ix.accounts[0]!==0||ix.accounts[1]<3||!writable(envelope,ix.accounts[1]))fail();
   const target=targets.get(roles[1]);
   if(!target||created.has(roles[1])||used.has(roles[1])||roles[2]!==target[0]||roles[3]!==target[1]||roles[4]!==SYSTEM||roles[5]!==TOKEN)fail();
   for(const role of [3,4,5])if(ix.accounts[role]<3||writable(envelope,ix.accounts[role]))fail();
   created.add(roles[1]);continue;
  }
  if(program===TOKEN){
   if(plan.side!=='LONG'||!swapped||closedCollateral||data.length!==1||data[0]!==9||roles.length!==3
    ||roles[0]!==bindings.collateralAccount||ix.accounts[1]!==0||ix.accounts[2]!==0||!writable(envelope,ix.accounts[0]))fail();
   closedCollateral=true;continue;
  }
  if(program!==PERPS_PROGRAM)fail();
  const tag=data.subarray(0,8).toString('hex');
  if(!['e455b9704e4f4d02','2e17f02c1e8a5e8c','a2bfc83e8b3eb011','8b8deec529d3ac13'].includes(tag))fail();
  if(tag==='2e17f02c1e8a5e8c'||tag==='a2bfc83e8b3eb011')core=true;
  if(tag==='8b8deec529d3ac13')swapped=true;
  for(const role of roles)used.add(role);
 }
 if(!core||plan.side==='LONG'&&!swapped)fail();
 const result=Object.freeze({stage:'FULL_CLOSE_INSTRUCTION_POLICY_ONLY',readyForSigning:false,tradingEnabled:false,
  createdAccounts:Object.freeze([...created]),closedCollateralAccount:closedCollateral?bindings.collateralAccount:null,
  requiresProtocolAndOracleEffects:true,requiresIndependentMinimumReturn:true,requiresDurableCloseAccounting:true});
 policies.set(result,Object.freeze({inspection,oracleContext}));return result;
}
