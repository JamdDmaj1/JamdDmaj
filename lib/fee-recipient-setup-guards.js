// Only non-mutating Lighthouse assertion variants, never MemoryWrite/Close,
// arbitrary programs, extra accounts or noop CPI logging. Source reviewed:
// Jac0xb/lighthouse@4c579479c98635e419b1b167f08be02a71604a71.
import bs58 from 'bs58';
export const SETUP_LIGHTHOUSE='L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95';
function fail(){throw Error('INVALID_RECIPIENT_SETUP_REVIEW');}
export function parseSetupSignedMessage(wire){
 if(!(wire instanceof Uint8Array)||wire.length>1232||wire[0]!==1)fail();
 let p=65;const byte=()=>{if(p>=wire.length)fail();return wire[p++];};
 const small=max=>{const n=byte();if(n>max||n>=128)fail();return n;};
 const take=n=>{if(p+n>wire.length)fail();const b=wire.subarray(p,p+n);p+=n;return b;};
 const versioned=wire[p]===128;if(versioned)byte();
 const header=[byte(),byte(),byte()],count=small(8);if(count<7)fail();
 const keys=Array.from({length:count},()=>bs58.encode(take(32))),blockhash=bs58.encode(take(32));
 const instructions=Array.from({length:small(7)},()=>{const program=small(count-1),accounts=Array.from({length:small(6)},()=>small(count-1)),data=take(small(120));return {program,accounts,data};});
 if(versioned&&byte()!==0)fail();if(p!==wire.length)fail();
 return {versioned,header,keys,blockhash,instructions};
}
export function validateSetupGuard(ix,keys){
 if(keys[ix.program]!==SETUP_LIGHTHOUSE||ix.accounts.length!==1)fail();
 const data=ix.data;let p=0;const byte=()=>{if(p>=data.length)fail();return data[p++];};
 const take=n=>{if(p+n>data.length)fail();p+=n;};
 const op=integer=>{if(byte()>(integer?5:1))fail();};
 const bool=()=>{if(byte()>1)fail();};
 const option=n=>{const tag=byte();if(tag>1)fail();if(tag)take(n);};
 const kind=byte(),log=byte();if(log>2||![5,6,9,10].includes(kind))fail();
 const token=kind===9||kind===10,target=ix.accounts[0];if(token?target!==1:target!==0&&target!==1)fail();
 const count=kind===6||kind===10?byte():1;if(count<1||count>8)fail();
 for(let i=0;i<count;i++){
  const field=byte();
  if(token){
   if(field===0||field===1){take(32);op(false);}
   else if(field===2||field===6){take(8);op(true);}
   else if(field===3||field===7){option(32);op(false);}
   else if(field===4){if(byte()>2)fail();op(true);}
   else if(field===5){option(8);op(false);}
   else if(field!==8)fail();
  }else{
   if(field===0||field===1||field===4){take(8);op(true);}
   else if(field===2){take(32);op(false);}
   else if(field>=5&&field<=7){bool();op(false);}
   else fail(); // KnownOwner/hash encodings intentionally not authorized.
  }
 }
 if(p!==data.length)fail();
}
// Public structural metadata only. Never return signed bytes, signature,
// blockhash, full account table, assertion values or arbitrary instruction data.
export function setupInstructionSummary(wire){
 try{const parsed=parseSetupSignedMessage(wire);return parsed.instructions.map(ix=>({program:parsed.keys[ix.program],opcode:ix.data[0]??0,bytes:ix.data.length,accounts:ix.accounts.length}));}catch{return [];}
}
