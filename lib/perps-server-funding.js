// Exact simulated wallet debits. This is not instruction or signing approval.
import bs58 from 'bs58';
import {PERPS_PROGRAM,PERPS_CUSTODIES} from './perps-server-custody.js';
const SYSTEM='11111111111111111111111111111111',TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN2022='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',MAX=18446744073709551615n;
function fail(){throw Error('PERPS_SIMULATED_FUNDING_MISMATCH');}
function key(value){try{if(typeof value!=='string'||bs58.decode(value).length!==32)fail();return value;}catch{fail();}}
function units(value){if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<0))fail();if(!/^(0|[1-9][0-9]{0,19})$/.test(String(value)))fail();const n=BigInt(value);if(n>MAX)fail();return n;}
function state(value){
 if(value===null)return null;
 if(!value||typeof value.executable!=='boolean'||!Array.isArray(value.data)||value.data.length!==2||value.data[1]!=='base64'||typeof value.data[0]!=='string'||value.data[0].length>21848)fail();
 const bytes=Buffer.from(value.data[0],'base64');if(bytes.length>16384||bytes.toString('base64')!==value.data[0])fail();
 return {owner:key(value.owner),executable:value.executable,lamports:units(value.lamports),bytes};
}
function closed(s){return s===null||(s.owner===SYSTEM&&!s.executable&&s.lamports===0n&&s.bytes.length===0);}
function system(s){if(!s||s.owner!==SYSTEM||s.executable||s.bytes.length)fail();}
function option(b,offset){const flag=b.readUInt32LE(offset);if(flag>1)fail();return flag===1;}
function token(s,owner,mint){
 if(!s||s.owner!==TOKEN||s.executable||s.bytes.length!==165)fail();const b=s.bytes;
 const delegate=option(b,72),native=option(b,109),close=option(b,129);
 if(bs58.encode(b.subarray(0,32))!==mint||bs58.encode(b.subarray(32,64))!==owner||b[108]!==1||delegate
  ||(close&&bs58.encode(b.subarray(133,165))!==owner)||native!==(mint===PERPS_CUSTODIES.SOL.mint))fail();
 return b.readBigUInt64LE(64);
}
function controlled(s,wallet){
 if(!s||![TOKEN,TOKEN2022].includes(s.owner))return false;const b=s.bytes;
 return (b.length>=64&&b.subarray(32,64).equals(wallet))||(b.length>=108&&b[72]!==0&&b.subarray(76,108).equals(wallet))||(b.length>=165&&b[129]!==0&&b.subarray(133,165).equals(wallet));
}
function same(a,b){return a===b||!!(a&&b&&a.owner===b.owner&&a.executable===b.executable&&a.lamports===b.lamports&&a.bytes.equals(b.bytes));}
export function inspectServerPerpsFunding({payer,source,marginUnits,feeLamports,before,after,rents={},emptyFundingClosures={}}){
 key(payer);key(source);const margin=units(marginUnits),fee=units(feeLamports),wallet=Buffer.from(bs58.decode(payer));
 if(payer===source||margin===0n||fee===0n||fee>1000000n||!before||!after||!rents||!emptyFundingClosures)fail();
 const addresses=Object.keys(before);if(addresses.length>100||addresses.length!==Object.keys(after).length||addresses.some(a=>!Object.hasOwn(after,a))||!Object.hasOwn(before,payer)||!Object.hasOwn(before,source))fail();
 const old=Object.fromEntries(addresses.map(a=>[key(a),state(before[a])])),next=Object.fromEntries(addresses.map(a=>[a,state(after[a])]));
 system(old[payer]);system(next[payer]);const amount=token(old[source],payer,PERPS_CUSTODIES.USDC.mint);if(amount<margin)fail();
 let locked=0n,refunded=0n;
 if(closed(next[source])){if(amount!==margin)fail();refunded+=old[source].lamports;}
 else{
  if(amount-token(next[source],payer,PERPS_CUSTODIES.USDC.mint)!==margin||old[source].lamports!==next[source].lamports)fail();
  const a=Buffer.from(old[source].bytes),b=Buffer.from(next[source].bytes);a.fill(0,64,72);b.fill(0,64,72);if(!a.equals(b))fail();
 }
 for(const [address,rent]of Object.entries(rents)){
  key(address);if(address===payer||address===source||!Object.hasOwn(old,address)||!rent||![PERPS_PROGRAM,TOKEN].includes(rent.program))fail();
  const minimum=units(rent.minimum);if(minimum===0n||!next[address]||next[address].executable||next[address].owner!==rent.program)fail();
  if(rent.program===TOKEN&&token(next[address],key(rent.tokenOwner),key(rent.mint))!==0n)fail();
  if(closed(old[address])){if(next[address].lamports!==minimum)fail();locked+=minimum;}
  else if(old[address].executable||old[address].owner!==next[address].owner||old[address].lamports!==next[address].lamports)fail();
 }
 for(const address of addresses){
  const a=old[address],b=next[address];if(address===source||(!controlled(a,wallet)&&!controlled(b,wallet))||same(a,b))continue;
  const rent=Object.hasOwn(rents,address)?rents[address]:null;
  if(closed(a)&&rent?.program===TOKEN&&rent.tokenOwner===payer)continue;
  const mint=Object.hasOwn(emptyFundingClosures,address)?emptyFundingClosures[address]:null;
  if(mint&&closed(b)&&a&&token(a,payer,key(mint))===0n){refunded+=a.lamports;continue;}
  fail();
 }
 if(locked>30000000n||old[payer].lamports+refunded-fee-locked!==next[payer].lamports)fail();
 return Object.freeze({stage:'FUNDING_EFFECTS_ONLY',readyForSigning:false,usdcDebitUnits:margin.toString(),networkFeeLamports:fee.toString(),rentLockedLamports:locked.toString(),rentRefundedLamports:refunded.toString()});
}
