import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {decodeServerPerpsPreSwap,minimumServerPerpsCollateralOutput,checkServerPerpsPreSwapBindings,inspectServerPerpsPreSwapPlan} from '../lib/perps-server-preswap.js';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,decodeServerPerpsCustody,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',key=n=>bs58.encode(Buffer.alloc(32,n));
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const encoded=(input=10000000n,output=99500000n)=>Buffer.concat([Buffer.from('c52656a5c71726ea','hex'),u64(input),u64(output)]).toString('base64');
function custody(asset,index){const id=PERPS_CUSTODIES[asset],b=Buffer.alloc(416);Buffer.from('01b830515d833f91','hex').copy(b);Buffer.from(bs58.decode(PERPS_POOL)).copy(b,8);Buffer.from(bs58.decode(id.mint)).copy(b,40);Buffer.alloc(32,100+index).copy(b,72);b[104]=id.decimals;b[105]=Number(id.stable);Buffer.alloc(32,110+index).copy(b,106);b[138]=2;b.writeBigUInt64LE(500000n,175);b[199]=b[202]=1;Buffer.alloc(32,120+index).copy(b,384);return decodeServerPerpsCustody(asset,id.address,{owner:PERPS_PROGRAM,executable:false,data:[b.toString('base64'),'base64']});}
async function fixture(){
 const intent={walletAddress:key(1),asset:'SOL',side:'LONG',marginUsd:'10',referencePrice:'100',maxSlippageBps:50,leverage:'3'},usdc=custody('USDC',1),collateral=custody('SOL',0),ids=await deriveServerPerpsIdentities(intent);
 const associated=async mint=>(await getProgramDerivedAddress({programAddress:'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',seeds:[bs58.decode(intent.walletAddress),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];
 const swap=[intent.walletAddress,await associated(usdc.mint),await associated(collateral.mint),ids.transferAuthority,ids.perpetuals,PERPS_POOL,usdc.address,usdc.dovesAgOracle,usdc.tokenAccount,collateral.address,collateral.dovesAgOracle,collateral.tokenAccount,TOKEN,'Sysvar1nstructions1111111111111111111111111',ids.eventAuthority,PERPS_PROGRAM];
 const ledger=[key(45),swap[2],TOKEN],opening=[key(2),key(3),intent.walletAddress,swap[2],ids.perpetuals,PERPS_POOL,ids.position,collateral.address,collateral.dovesAgOracle,collateral.oracle,collateral.address,collateral.dovesAgOracle,collateral.oracle,collateral.tokenAccount,ledger[0],PERPS_PROGRAM,TOKEN,'11111111111111111111111111111111',ids.eventAuthority,PERPS_PROGRAM];
 const resolvedKeys=[intent.walletAddress,...new Set(opening.filter(k=>k!==intent.walletAddress))];
 const inspection={stage:'INSPECTED_NOT_AUTHORIZED',resolvedKeys,envelope:{staticKeys:resolvedKeys,instructions:[{program:resolvedKeys.indexOf(PERPS_PROGRAM),accounts:opening.map(k=>resolvedKeys.indexOf(k)),dataBase64:Buffer.from('a47e44b6dfa640b7','hex').toString('base64')}]}};
 return {intent,usdc,collateral,swap,ledger,opening,inspection};
}
test('pre-swap decoder accepts only exact ledger/swap forms and positive u64 values',()=>{
 assert.equal(decodeServerPerpsPreSwap(Buffer.from('e455b9704e4f4d02','hex').toString('base64')).kind,'SET_LEDGER');
 assert.equal(decodeServerPerpsPreSwap(encoded(18446744073709551615n,1n)).amountIn,'18446744073709551615');
 for(const value of ['',encoded(0n),encoded(1n,0n),encoded()+'\n',Buffer.concat([Buffer.from(encoded(),'base64'),Buffer.from([0])]).toString('base64')])assert.throws(()=>decodeServerPerpsPreSwap(value));
});
test('minimum output rounds upward exactly and rejects overflow or unsafe parameters',()=>{
 assert.equal(minimumServerPerpsCollateralOutput({marginUsd:'10',referencePrice:'100',maxSlippageBps:50},9),'99500000');
 assert.equal(minimumServerPerpsCollateralOutput({marginUsd:'10',referencePrice:'3',maxSlippageBps:1},8),'333300000');
 assert.equal(minimumServerPerpsCollateralOutput({marginUsd:'10',referencePrice:'7',maxSlippageBps:1},8),'142842858');
 for(const [intent,decimals]of [[{marginUsd:'10',referencePrice:'0',maxSlippageBps:50},9],[{marginUsd:'10',referencePrice:'1',maxSlippageBps:0},9],[{marginUsd:'999999999',referencePrice:'0.000001',maxSlippageBps:1},18]])assert.throws(()=>minimumServerPerpsCollateralOutput(intent,decimals));
});
test('pre-swap binds trusted custody vaults, associated accounts, ledger and exact funding limits',async()=>{
 const f=await fixture(),check=()=>checkServerPerpsPreSwapBindings(f.inspection,f.intent,f.usdc,f.collateral,f.swap,f.ledger,f.opening,encoded());
 const result=await check();assert.equal(result.readyForSigning,false);assert.equal(result.requiredMinimumOut,'99500000');
 for(let i=0;i<16;i++){const old=f.swap[i];f.swap[i]=key(60+i);await assert.rejects(check());f.swap[i]=old;}
 for(const index of [0,1,2]){const old=f.ledger[index];f.ledger[index]=key(80+index);await assert.rejects(check());f.ledger[index]=old;}
 await assert.rejects(checkServerPerpsPreSwapBindings(f.inspection,f.intent,{...f.usdc},f.collateral,f.swap,f.ledger,f.opening,encoded()));
 for(const data of [encoded(9999999n),encoded(10000001n),encoded(10000000n,99499999n)])await assert.rejects(checkServerPerpsPreSwapBindings(f.inspection,f.intent,f.usdc,f.collateral,f.swap,f.ledger,f.opening,data));
});
async function planFixture(){
 const f=await fixture();
 const readonly=[f.swap[3],f.swap[4],TOKEN,f.swap[13],f.swap[14],PERPS_PROGRAM,'11111111111111111111111111111111'];
 const signers=[f.intent.walletAddress,key(2),key(3)];
 const all=[...f.swap,...f.ledger,...f.opening],keys=[...signers,...new Set(all.filter(k=>!signers.includes(k)&&!readonly.includes(k))),...readonly];
 const ix=(roles,data)=>({program:keys.indexOf(PERPS_PROGRAM),accounts:roles.map(k=>keys.indexOf(k)),dataBase64:data});
 const opening=Buffer.concat([Buffer.from('a47e44b6dfa640b7','hex'),u64(30000000),Buffer.from([0,1]),u64(100500000),u64(1000)]).toString('base64');
 f.inspection={stage:'INSPECTED_NOT_AUTHORIZED',resolvedKeys:keys,envelope:{stage:'STRUCTURE_ONLY',staticKeys:keys,accountCount:keys.length,readonlySigned:1,readonlyUnsigned:readonly.length,lookups:[],instructions:[ix(f.ledger,Buffer.from('e455b9704e4f4d02','hex').toString('base64')),ix(f.swap,encoded()),ix(f.opening,opening)]}};
 return f;
}
test('long plan requires ledger then pre-swap then opening and exact writable/non-signer capabilities',async()=>{
 const f=await planFixture(),run=()=>inspectServerPerpsPreSwapPlan(f.inspection,f.intent,f.usdc,f.collateral);
 const result=await run();assert.equal(result.ledger.address,f.ledger[0]);assert.equal(result.readyForSigning,false);assert.equal(result.requiresFullTokenPolicy,true);
 const instructions=f.inspection.envelope.instructions;
 for(const sequence of [[instructions[1],instructions[0],instructions[2]],[instructions[0],instructions[2],instructions[1]],[instructions[0],instructions[0],instructions[1],instructions[2]],[instructions[0],instructions[1],instructions[1],instructions[2]],[instructions[0],instructions[2]],[instructions[2]]]){
  f.inspection.envelope.instructions=sequence;await assert.rejects(run());
 }
 f.inspection.envelope.instructions=instructions;
 for(const role of [1,2,5,6,8,9,11,3,4,12,13,14,15,7,10]){
  const ix=instructions[1],previous=ix.accounts[role];ix.accounts[role]=0;await assert.rejects(run());ix.accounts[role]=previous;
 }
 const previous=f.inspection.envelope.readonlyUnsigned;f.inspection.envelope.readonlyUnsigned=0;await assert.rejects(run());f.inspection.envelope.readonlyUnsigned=previous;
});
test('short plan requires direct native USDC collateral and forbids auxiliary conversion',async()=>{
 const f=await fixture();f.intent.side='SHORT';const ids=await deriveServerPerpsIdentities(f.intent),opening=[...f.opening];
 opening[3]=f.swap[1];opening[6]=ids.position;opening[10]=f.usdc.address;opening[11]=f.usdc.dovesAgOracle;opening[12]=f.usdc.oracle;opening[13]=f.usdc.tokenAccount;opening[14]=PERPS_PROGRAM;
 const signers=[f.intent.walletAddress,key(2),key(3)],readonly=[TOKEN,'11111111111111111111111111111111',ids.eventAuthority,PERPS_PROGRAM];
 const keys=[...signers,...new Set(opening.filter(k=>!signers.includes(k)&&!readonly.includes(k))),...readonly];
 const data=Buffer.concat([Buffer.from('a47e44b6dfa640b7','hex'),u64(30000000),Buffer.from([1]),u64(10000000),Buffer.from([2]),u64(99500000),u64(1000)]);
 const ix={program:keys.indexOf(PERPS_PROGRAM),accounts:opening.map(k=>keys.indexOf(k)),dataBase64:data.toString('base64')};
 f.inspection={stage:'INSPECTED_NOT_AUTHORIZED',resolvedKeys:keys,envelope:{stage:'STRUCTURE_ONLY',staticKeys:keys,accountCount:keys.length,readonlySigned:1,readonlyUnsigned:readonly.length,lookups:[],instructions:[ix]}};
 const run=()=>inspectServerPerpsPreSwapPlan(f.inspection,f.intent,f.usdc,f.collateral);
 assert.equal((await run()).ledger,null);
 data.writeBigUInt64LE(9999999n,17);ix.dataBase64=data.toString('base64');await assert.rejects(run());data.writeBigUInt64LE(10000000n,17);ix.dataBase64=data.toString('base64');
 for(const role of [3,14,15]){const previous=ix.accounts[role];ix.accounts[role]=0;await assert.rejects(run());ix.accounts[role]=previous;}
 f.inspection.envelope.instructions.unshift({program:ix.program,accounts:[0,0,0],dataBase64:Buffer.from('e455b9704e4f4d02','hex').toString('base64')});await assert.rejects(run());
});
