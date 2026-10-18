import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {decodeServerPerpsPreSwap,minimumServerPerpsCollateralOutput,checkServerPerpsPreSwapBindings} from '../lib/perps-server-preswap.js';
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
