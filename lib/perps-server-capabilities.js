// Early server capability and priority-fee boundary, matching native checks.
// Not a complete policy: token/ATA roles, verified oracle/custody accounts,
// funding effects and same-wire simulation remain mandatory before signing.
const COMPUTE='ComputeBudget111111111111111111111111111111';
const PERPS='PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu';
const DOVES='DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e';
const ED25519='Ed25519SigVerify111111111111111111111111111';
const ALLOWED=new Set([COMPUTE,PERPS,DOVES,ED25519,'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA','ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL']);
function fail(){throw Error('UNSAFE_PERPS_CAPABILITIES_OR_FEE');}
export function checkServerPerpsCapabilities(envelope){
 if(envelope?.stage!=='STRUCTURE_ONLY'||!Array.isArray(envelope.staticKeys)||!Array.isArray(envelope.instructions)
   ||!Number.isInteger(envelope.readonlyUnsigned)||envelope.readonlyUnsigned<0)fail();
 let units=null,price=null,body=false,opened=false;
 for(const instruction of envelope.instructions){
  const index=instruction.program;
  // Invoked program IDs must be static, read-only and never signers.
  if(!Number.isInteger(index)||index<3||index>=envelope.staticKeys.length||index<envelope.staticKeys.length-envelope.readonlyUnsigned)fail();
  const program=envelope.staticKeys[index];if(!ALLOWED.has(program))fail();
  if(typeof instruction.dataBase64!=='string'||instruction.dataBase64.length>1644||!Array.isArray(instruction.accounts))fail();
  const data=Buffer.from(instruction.dataBase64,'base64');if(data.toString('base64')!==instruction.dataBase64)fail();
  if(program===COMPUTE){
   if(body||instruction.accounts.length)fail();
   if(data.length===5&&data[0]===2&&units===null){units=BigInt(data.readUInt32LE(1));if(units<1n||units>1400000n)fail();}
   else if(data.length===9&&data[0]===3&&price===null)price=data.readBigUInt64LE(1);
   else fail();
  }else body=true;
  const tag=data.subarray(0,8).toString('hex');
  if(program===PERPS&&!['e455b9704e4f4d02','c52656a5c71726ea'].includes(tag))opened=true;
  if(program===DOVES||program===ED25519){
   if(opened||(program===ED25519&&instruction.accounts.length)||instruction.accounts.includes(0))fail();
  }
 }
 if(units===null||price===null||!body)fail();
 const priorityFee=(BigInt(units)*BigInt(price)+999999n)/1000000n;if(priorityFee>1000000n)fail();
 return Object.freeze({stage:'CAPABILITIES_ONLY',readyForSigning:false,computeUnitLimit:units.toString(),priorityFeeLamports:priorityFee.toString()});
}
