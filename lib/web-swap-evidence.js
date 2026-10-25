// Confirmed chain state and simulated effects. No keys or signing authority.
import bs58 from 'bs58';
import {SWAP_IDS as I,from64,uint,swapFail,to64} from './web-swap-policy.js';
export function rpcInteger(value){if(!Number.isSafeInteger(value)||value<0)swapFail();return BigInt(value);}
export function accountData(value){if(!Array.isArray(value?.data)||value.data.length!==2||value.data[1]!=='base64')swapFail();return from64(value.data[0],166);}
function option(data,at){const n=uint(data,at,4);if(n!==0n&&n!==1n)swapFail();return n===1n;}
export function tokenAmount(value,owner,mint,creating=false){
 if(value===null){if(!creating)swapFail();return 0n;}
 if(value?.owner!==I.TOKEN||value.executable!==false)swapFail();const d=accountData(value);
 if(d.length!==165||bs58.encode(d.subarray(0,32))!==mint||bs58.encode(d.subarray(32,64))!==owner||d[108]!==1||option(d,72)||uint(d,121,8)!==0n||option(d,129)&&bs58.encode(d.subarray(133,165))!==owner||option(d,109)!==(mint===I.SOL))swapFail();
 return uint(d,64,8);
}
function lamports(value){return value===null?0n:rpcInteger(value.lamports);}
function system(value){if(value?.owner!==I.SYSTEM||value.executable!==false||accountData(value).length!==0)swapFail();return lamports(value);}
function closed(value){return value===null||value?.owner===I.SYSTEM&&value.executable===false&&lamports(value)===0n&&accountData(value).length===0;}
function mint(value,decimals){if(value?.owner!==I.TOKEN||value.executable!==false)swapFail();const d=accountData(value);if(d.length!==82||decimals!==undefined&&d[44]!==decimals||d[44]>18||d[45]!==1)swapFail();}
function context(response,minimum){const slot=rpcInteger(response?.context?.slot);if(slot<minimum)swapFail();return slot;}
export function unsignedSwapWire(message){const out=new Uint8Array(65+message.length);out[0]=1;out.set(message,65);return out;}
export async function inspectSwapEvidence(candidate,rpc,{signedWire}={}){
 const c=candidate,{payer,inputMint,outputMint,amount}=c.intent,input=BigInt(amount),nativeInput=inputMint===I.SOL;
 if(await rpc('getGenesisHash',[])!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')swapFail();
 let minimum=rpcInteger(await rpc('getSlot',[{commitment:'confirmed'}]));
 const extras=c.intermediates||[],requested=[...new Set([...c.keys.filter(k=>k.writable).map(k=>k.address),inputMint,outputMint,...extras.map(v=>v.mint)])];if(requested.length>100)swapFail();
 const accounts=new Map();for(let offset=0;offset<requested.length;offset+=10){const batch=requested.slice(offset,offset+10),response=await rpc('getMultipleAccounts',[batch,{encoding:'base64',commitment:'confirmed',minContextSlot:Number(minimum),dataSlice:{offset:0,length:166}}]);minimum=context(response,minimum);
  if(!Array.isArray(response.value)||response.value.length!==batch.length)swapFail();for(let i=0;i<batch.length;i++)accounts.set(batch[i],response.value[i]);
 }
 const sol=system(accounts.get(payer)),source=accounts.get(c.source),destination=accounts.get(c.destination);
 const sourceAmount=tokenAmount(source,payer,inputMint,c.createSource),destinationAmount=tokenAmount(destination,payer,outputMint,c.createDestination);
 mint(accounts.get(inputMint),nativeInput?9:6);mint(accounts.get(outputMint),nativeInput?6:9);
 for(const extra of extras){mint(accounts.get(extra.mint));if(tokenAmount(accounts.get(extra.address),payer,extra.mint,true)!==0n)swapFail();}
 for(const [address,value]of accounts){if(!value||[c.source,c.destination,...extras.map(v=>v.address)].includes(address)||![I.TOKEN,'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'].includes(value.owner))continue;const d=accountData(value);
  if(d.length>=165&&(bs58.encode(d.subarray(32,64))===payer||d[72]===1&&bs58.encode(d.subarray(76,108))===payer||d[129]===1&&bs58.encode(d.subarray(133,165))===payer))swapFail();
 }
 // Reject pre-existing WSOL here rather than unwrapping it as a hidden side effect.
 if(nativeInput&&sourceAmount!==0n||!nativeInput&&destinationAmount!==0n)throw Error('WEB_SWAP_EXISTING_WRAPPED_SOL');
 if(!nativeInput&&sourceAmount<input)throw Error('WEB_SWAP_INSUFFICIENT_FUNDS');
 const validity=await rpc('isBlockhashValid',[bs58.encode(c.messageBlockhash),{commitment:'confirmed',minContextSlot:Number(minimum)}]);minimum=context(validity,minimum);if(validity.value!==true)throw Error('WEB_SWAP_REVIEW_EXPIRED');
 const feeResponse=await rpc('getFeeForMessage',[to64(c.message),{commitment:'confirmed',minContextSlot:Number(minimum)}]);minimum=context(feeResponse,minimum);const fee=rpcInteger(feeResponse.value);if(fee<1n||fee>1000000n)swapFail();
 const rent=rpcInteger(await rpc('getMinimumBalanceForRentExemption',[165,{commitment:'confirmed'}]));if(rent<1n)swapFail();
 const maxRent=(source===null?rent:0n)+(destination===null?rent:0n)+extras.reduce((n,e)=>n+(accounts.get(e.address)===null?rent:0n),0n);
 if(sol<fee+maxRent+(nativeInput?input:0n))throw Error('WEB_SWAP_INSUFFICIENT_FUNDS');
 const simulation=await rpc('simulateTransaction',[to64(signedWire||unsignedSwapWire(c.message)),{encoding:'base64',sigVerify:!!signedWire,replaceRecentBlockhash:false,commitment:'confirmed',minContextSlot:Number(minimum),accounts:{encoding:'base64',addresses:[payer,c.source,c.destination,...extras.map(v=>v.address)]}}]);
 minimum=context(simulation,minimum);const value=simulation?.value;if(value?.err!==null||!Array.isArray(value.accounts)||value.accounts.length!==3+extras.length||rpcInteger(value.unitsConsumed)<1n||rpcInteger(value.unitsConsumed)>1400000n)throw Error('WEB_SWAP_SIMULATION_FAILED');
 const [afterPayer,afterSource,afterDestination]=value.accounts,afterSol=system(afterPayer);
 let sourceRent=0n,destRent=0n,output;
 const rentChange=(before,after)=>{const a=lamports(before),b=lamports(after);if(a===0n){if(b!==rent)swapFail();return rent;}if(a!==b)swapFail();return 0n;};
 let extraRent=0n;for(let i=0;i<extras.length;i++){const extra=extras[i],after=value.accounts[3+i];if(tokenAmount(after,payer,extra.mint)!==0n)swapFail();extraRent+=rentChange(accounts.get(extra.address),after);}
 if(nativeInput){
  if(!closed(afterSource))swapFail();output=tokenAmount(afterDestination,payer,outputMint)-destinationAmount;destRent=rentChange(destination,afterDestination);
  if(afterSol!==sol-fee-destRent-extraRent-input+lamports(source))swapFail();
 }else{
  if(!closed(afterDestination)||sourceAmount-tokenAmount(afterSource,payer,inputMint)!==input)swapFail();sourceRent=rentChange(source,afterSource);
  output=afterSol-sol+fee+sourceRent+extraRent-lamports(destination);
 }
 if(output<c.minimum)swapFail();
 if(await rpc('getGenesisHash',[])!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')swapFail();
 return Object.freeze({fee:fee.toString(),rent:(sourceRent+destRent+extraRent).toString(),output:output.toString(),slot:Number(minimum)});
}
