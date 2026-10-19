// Native-compatible pending TP/SL state verification, not signing authority.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from './perps-server-custody.js';
import {exactUsdUnits} from './jupiter-perps-order.js';
function fail(){throw Error('PERPS_SIMULATED_EXIT_MISMATCH');}
// Reconstruct expected creation arguments from the durable entry binding solely
// to compare a still-pending native request. This is not a transaction builder.
export async function decodeRecordedServerPerpsExit(exit,account,intent){
 if(!exit||!['SL','TP'].includes(exit.kind)||!['LONG','SHORT'].includes(intent?.side))fail();
 for(const key of ['sizeUsdUnits','triggerPriceUsdUnits','counter'])if(typeof exit[key]!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(exit[key])||BigInt(exit[key])>18446744073709551615n)fail();
 if(BigInt(exit.sizeUsdUnits)===0n||BigInt(exit.triggerPriceUsdUnits)===0n)fail();
 const instruction=Buffer.alloc(50);Buffer.from('7562427f1e3249b9','hex').copy(instruction);
 instruction.writeBigUInt64LE(BigInt(exit.sizeUsdUnits),16);instruction.writeBigUInt64LE(BigInt(exit.triggerPriceUsdUnits),24);
 instruction[32]=(exit.kind==='TP')===(intent.side==='LONG')?1:0;instruction.writeBigUInt64LE(BigInt(exit.counter),34);
 const units=BigInt(exit.triggerPriceUsdUnits),price=(units/1000000n).toString()+'.'+(units%1000000n).toString().padStart(6,'0');
 return decodeServerPerpsExit(exit.address,account,{...intent,stopLoss:exit.kind==='SL'?price:null,takeProfit:exit.kind==='TP'?price:null},instruction.toString('base64'));
}
export async function decodeServerPerpsExit(address,account,intent,instructionBase64){
 if(account?.owner!==PERPS_PROGRAM||account.executable!==false||!Array.isArray(account.data)||account.data.length!==2
   ||account.data[1]!=='base64'||typeof account.data[0]!=='string'||account.data[0].length>5464||typeof instructionBase64!=='string')fail();
 const data=Buffer.from(account.data[0],'base64'),instruction=Buffer.from(instructionBase64,'base64');
 if(data.toString('base64')!==account.data[0]||data.length<230||data.length>4096||data.subarray(0,8).toString('hex')!=='0c26fac72e9a20d8'
   ||instruction.toString('base64')!==instructionBase64||instruction.length!==50||instruction.subarray(0,8).toString('hex')!=='7562427f1e3249b9'
   ||instruction.readBigUInt64LE(8)!==0n||instruction.readBigUInt64LE(16)===0n||instruction.readBigUInt64LE(24)===0n||instruction[32]>1||instruction[33]!==0)fail();
 const ids=await deriveServerPerpsIdentities(intent),side=intent.side==='LONG'?1:2;
 for(const [offset,expected]of [[8,intent.walletAddress],[40,PERPS_POOL],[72,PERPS_CUSTODIES[intent.asset].address],[104,ids.position],[136,PERPS_CUSTODIES.USDC.mint]]){
  if(bs58.encode(data.subarray(offset,offset+32))!==expected)fail();
 }
 const opened=data.readBigUInt64LE(168),updated=data.readBigUInt64LE(176),size=data.readBigUInt64LE(184),price=data.readBigUInt64LE(207),counter=data.readBigUInt64LE(220);
 if(opened===0n||opened>9223372036854775807n||updated>9223372036854775807n||updated<opened||size!==instruction.readBigUInt64LE(16)||data.readBigUInt64LE(192)!==0n
   ||data[200]!==2||data[201]!==1||data[202]!==side||data[203]!==0||data[204]!==0||data[205]!==0
   ||data[206]!==1||price!==instruction.readBigUInt64LE(24)||data[215]!==1||data[216]!==instruction[32]
   ||data[217]!==1||data[218]!==0||data[219]!==0||counter!==instruction.readBigUInt64LE(34)||data[229]!==0||data.subarray(230).some(n=>n!==0))fail();
 const profit=(instruction[32]===1)===(side===1),expectedPrice=profit?intent.takeProfit:intent.stopLoss;
 if(expectedPrice==null||price!==BigInt(exactUsdUnits(expectedPrice)))fail();
 const [request,bump]=await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position_request',bs58.decode(ids.position),instruction.subarray(34,42),new Uint8Array([2])]});
 if(address!==request||data[228]!==bump)fail();
 return Object.freeze({stage:'EXIT_STATE_ONLY',readyForSigning:false,address,kind:profit?'TP':'SL',sizeUsdUnits:size.toString(),triggerPriceUsdUnits:price.toString(),counter:counter.toString()});
}
export async function checkServerPerpsSimulatedExits(prepared,before,after){
 const {envelope,resolvedKeys}=prepared.inspection,intent=prepared.intent,exits=[],seen=new Set();
 for(const instruction of envelope.instructions){
  if(envelope.staticKeys[instruction.program]!==PERPS_PROGRAM)continue;
  const tag=Buffer.from(instruction.dataBase64,'base64').subarray(0,8).toString('hex');
  if(tag!=='7562427f1e3249b9')continue;
  if(instruction.accounts.length!==20)fail();
  const address=resolvedKeys[instruction.accounts[7]],old=before[address],next=after[address];
  if(!Object.hasOwn(before,address)||!Object.hasOwn(after,address)||next===null||seen.has(address))fail();
  if(old!==null&&!(old?.owner==='11111111111111111111111111111111'&&old.executable===false&&String(old.lamports)==='0'&&Array.isArray(old.data)&&old.data[0]===''&&old.data[1]==='base64'))fail();
  exits.push(await decodeServerPerpsExit(address,next,intent,instruction.dataBase64));seen.add(address);
 }
 if(exits.length!==(intent.stopLoss==null?0:1)+(intent.takeProfit==null?0:1)||new Set(exits.map(e=>e.kind)).size!==exits.length)fail();
 return Object.freeze(exits);
}
