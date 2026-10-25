// Narrow SOL/USDC exact-input policy, matching native safeguards. No signer.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
export const SWAP_IDS=Object.freeze({SOL:'So11111111111111111111111111111111111111112',USDC:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',TOKEN:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA:'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM:'11111111111111111111111111111111',COMPUTE:'ComputeBudget111111111111111111111111111111',JUPITER:'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'});
export function swapFail(){throw Error('WEB_SWAP_POLICY_REJECTED');}
export function publicKey(value){try{if(typeof value!=='string'||value.length<32||value.length>44||bs58.decode(value).length!==32||bs58.encode(bs58.decode(value))!==value)swapFail();return value;}catch{swapFail();}}
export function swapUnits(value){if(typeof value!=='string'||!(/^[1-9][0-9]{0,19}$/).test(value)||BigInt(value)>18446744073709551615n)swapFail();return BigInt(value);}
export function from64(value,max=1232){try{if(typeof value!=='string'||value.length>Math.ceil(max/3)*4)swapFail();const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));if(bytes.length>max||to64(bytes)!==value)swapFail();return bytes;}catch{swapFail();}}
export function to64(bytes){return btoa(String.fromCharCode(...bytes));}
export function uint(bytes,at,size){if(at<0||at+size>bytes.length)swapFail();let n=0n;for(let i=size-1;i>=0;i--)n=n*256n+BigInt(bytes[at+i]);return n;}
export async function associated(owner,mint){return (await getProgramDerivedAddress({programAddress:SWAP_IDS.ATA,seeds:[bs58.decode(owner),bs58.decode(SWAP_IDS.TOKEN),bs58.decode(mint)]}))[0];}
const compact=value=>{if(!Number.isSafeInteger(value)||value<0||value>65535)swapFail();const out=[];do{let n=value&127;value>>>=7;if(value)n|=128;out.push(n);}while(value);return out;};
const join=(...arrays)=>Uint8Array.from(arrays.flatMap(v=>Array.from(v)));
export function compileSwapMessage(payer,blockhash,instructions,lookupTables=[]){
 publicKey(payer);publicKey(blockhash);if(!Array.isArray(instructions)||!instructions.length||instructions.length>64)swapFail();
 const metas=new Map([[payer,{address:payer,signer:true,writable:true}]]);
 const merge=(address,signer,writable)=>{publicKey(address);if(typeof signer!=='boolean'||typeof writable!=='boolean'||signer&&address!==payer)swapFail();const old=metas.get(address);metas.set(address,{address,signer:signer||!!old?.signer,writable:writable||!!old?.writable});};
 for(const ix of instructions){merge(ix.programId,false,false);if(!Array.isArray(ix.accounts)||ix.accounts.length>256)swapFail();for(const m of ix.accounts)merge(m.pubkey,m.isSigner,m.isWritable);from64(ix.data);}
 const ordered=[...metas.values()].sort((a,b)=>Number(b.signer)-Number(a.signer)||Number(b.writable)-Number(a.writable));if(ordered.length>256||ordered[0].address!==payer)swapFail();
 const programs=new Set(instructions.map(ix=>ix.programId)),loaded=new Set(),lookups=[];
 if(!Array.isArray(lookupTables)||lookupTables.length>32)swapFail();
 for(const table of lookupTables){publicKey(table.address);if(!Array.isArray(table.addresses)||table.addresses.length>256)swapFail();table.addresses.forEach(publicKey);const writable=[],readonly=[];
  for(const item of ordered){if(item.signer||programs.has(item.address)||loaded.has(item.address))continue;const at=table.addresses.indexOf(item.address);if(at<0)continue;(item.writable?writable:readonly).push(at);loaded.add(item.address);}
  if(writable.length+readonly.length)lookups.push({address:table.address,addresses:table.addresses,writable,readonly});
 }
 const statics=ordered.filter(k=>!loaded.has(k.address)),lookupKeys=writable=>lookups.flatMap(t=>t[writable?'writable':'readonly'].map(i=>metas.get(t.addresses[i])));
 const keys=[...statics,...lookupKeys(true),...lookupKeys(false)];
 const index=new Map(keys.map((k,i)=>[k.address,i]));
 const encoded=instructions.map(ix=>{const data=from64(ix.data);return join([index.get(ix.programId)],compact(ix.accounts.length),ix.accounts.map(m=>index.get(m.pubkey)),compact(data.length),data);});
 const message=join(lookups.length?[128,1,0,statics.filter(k=>!k.signer&&!k.writable).length]:[1,0,statics.filter(k=>!k.signer&&!k.writable).length],compact(statics.length),...statics.map(k=>bs58.decode(k.address)),bs58.decode(blockhash),compact(encoded.length),...encoded,...(lookups.length?[compact(lookups.length),...lookups.map(t=>join(bs58.decode(t.address),compact(t.writable.length),t.writable,compact(t.readonly.length),t.readonly))]:[]));
 if(message.length+65>1232)throw Error('WEB_SWAP_ROUTE_TOO_LARGE');
 return {message,keys};
}
export async function inspectWebSwapPreparation(preparation,intent,now=Date.now(),lookupTables=[]){
 const {payer,inputMint,outputMint,amount,slippageBps}=intent||{};publicKey(payer);
 if(![SWAP_IDS.SOL,SWAP_IDS.USDC].includes(inputMint)||![SWAP_IDS.SOL,SWAP_IDS.USDC].includes(outputMint)||inputMint===outputMint||!Number.isInteger(slippageBps)||slippageBps<1||slippageBps>100)swapFail();
 const input=swapUnits(amount),p=preparation;
 if(!p||p.network!=='solana-mainnet-beta'||p.taker!==payer||p.inputMint!==inputMint||p.outputMint!==outputMint||p.inAmount!==amount||p.slippageBps!==slippageBps||p.executable!==false||p.requiresNativeValidation!==true||!Number.isSafeInteger(p.receivedAt)||!Number.isSafeInteger(p.expiresAt)||p.receivedAt>now+1000||p.expiresAt<=now||p.expiresAt-p.receivedAt!==15000)swapFail();
 const quoted=swapUnits(p.outAmount),minimum=swapUnits(p.minimumOut);if(minimum!==(quoted*BigInt(10000-slippageBps)+9999n)/10000n)swapFail();swapUnits(p.lastValidBlockHeight);
 if(!Array.isArray(p.instructions)||p.instructions.length>64)swapFail();
 const instructions=p.instructions.map(ix=>({programId:publicKey(ix.programId),data:ix.data,accounts:ix.accounts.map(m=>({...m}))}));
 if(!instructions.some(ix=>ix.programId===SWAP_IDS.COMPUTE&&from64(ix.data)[0]===2))instructions.unshift({programId:SWAP_IDS.COMPUTE,accounts:[],data:to64(Uint8Array.of(2,192,92,21,0))});
 const compiled=compileSwapMessage(payer,p.blockhash,instructions,lookupTables),source=await associated(payer,inputMint),destination=await associated(payer,outputMint);
 const role=(ix,i,address)=>{if(ix.accounts[i]?.pubkey!==address)swapFail();};
 let route=-1,createSource=false,createDestination=false,transfer=false,sync=false,close=false,limit=null,price=null;const intermediates=[];
 for(let i=0;i<instructions.length;i++){
  const ix=instructions[i],data=from64(ix.data),accounts=ix.accounts;
  if(ix.programId===SWAP_IDS.JUPITER){
   if(route!==-1)swapFail();route=i;const tag=Array.from(data.subarray(0,8)).join(','),shared=tag==='209,152,83,147,124,254,216,233',start=shared?9:8;
   if(!shared&&tag!=='187,100,250,204,49,196,175,20')swapFail();
   if(data.length<start+26||uint(data,start,8)!==input||uint(data,start+8,8)!==quoted||uint(data,start+16,2)!==BigInt(slippageBps)||uint(data,start+18,2)!==0n||uint(data,start+20,2)!==0n)swapFail();
   const steps=Number(uint(data,start+22,4));if(steps<1||steps>64||data.length-start-26<steps*5||accounts.length<(shared?12:10))swapFail();
   for(const [at,key]of [[shared?1:0,payer],[shared?2:1,source],[shared?5:2,destination],[shared?6:3,inputMint],[shared?7:4,outputMint],[shared?8:5,SWAP_IDS.TOKEN],[shared?9:6,SWAP_IDS.TOKEN],[shared?11:9,SWAP_IDS.JUPITER]])role(ix,at,key);
   if(!shared&&![destination,SWAP_IDS.JUPITER].includes(accounts[7].pubkey))swapFail();
  }else if(ix.programId===SWAP_IDS.COMPUTE){
   if(route!==-1||accounts.length)swapFail();
   if(data.length===5&&data[0]===2&&limit===null){limit=uint(data,1,4);if(limit<1n||limit>1400000n)swapFail();}
   else if(data.length===9&&data[0]===3&&price===null)price=uint(data,1,8);else swapFail();
  }else if(ix.programId===SWAP_IDS.ATA){
   if(route!==-1||![6,7].includes(accounts.length)||!(data.length===0||data.length===1&&[0,1].includes(data[0])))swapFail();
   role(ix,0,payer);role(ix,2,payer);role(ix,4,SWAP_IDS.SYSTEM);role(ix,5,SWAP_IDS.TOKEN);
   if(accounts[1].pubkey===source&&!createSource){role(ix,3,inputMint);createSource=true;}
   else if(accounts[1].pubkey===destination&&!createDestination){role(ix,3,outputMint);createDestination=true;}
   else{
    const address=accounts[1].pubkey,mint=accounts[3].pubkey;
    if(intermediates.length>=4||[source,destination].includes(address)||[inputMint,outputMint].includes(mint)||intermediates.some(v=>v.address===address)||address!==await associated(payer,mint))swapFail();
    intermediates.push({address,mint});
   }
   if(accounts.length===7)role(ix,6,'SysvarRent111111111111111111111111111111111');
  }else if(ix.programId===SWAP_IDS.SYSTEM){
   if(route!==-1||inputMint!==SWAP_IDS.SOL||transfer||accounts.length!==2||data.length!==12||uint(data,0,4)!==2n||uint(data,4,8)!==input)swapFail();role(ix,0,payer);role(ix,1,source);transfer=true;
  }else if(ix.programId===SWAP_IDS.TOKEN){
   if(data.length!==1)swapFail();
   if(data[0]===17&&route===-1&&inputMint===SWAP_IDS.SOL&&transfer&&!sync&&accounts.length===1){role(ix,0,source);sync=true;}
   else if(data[0]===9&&route!==-1&&!close&&accounts.length===3){role(ix,0,inputMint===SWAP_IDS.SOL?source:destination);role(ix,1,payer);role(ix,2,payer);close=true;}else swapFail();
  }else swapFail();
 }
 if(route===-1||limit===null||!close||inputMint===SWAP_IDS.SOL&&(!transfer||!sync))swapFail();
 const priorityFee=((price??0n)*limit+999999n)/1000000n;if(priorityFee>1000000n)swapFail();
 const meta=new Map(compiled.keys.map(k=>[k.address,k]));
 for(const address of [inputMint,outputMint,SWAP_IDS.JUPITER,SWAP_IDS.TOKEN,SWAP_IDS.SYSTEM,SWAP_IDS.ATA,SWAP_IDS.COMPUTE])if(meta.get(address)?.writable||meta.get(address)?.signer)swapFail();
 if(!meta.get(source)?.writable||!meta.get(destination)?.writable)swapFail();
 for(const extra of intermediates)if(meta.get(extra.mint)?.writable||meta.get(extra.mint)?.signer||!meta.get(extra.address)?.writable||!instructions[route].accounts.some(a=>a.pubkey===extra.address))swapFail();
 const event=instructions[route].accounts[instructions[route].accounts.length>=12&&Array.from(from64(instructions[route].data).subarray(0,8)).join(',')==='209,152,83,147,124,254,216,233'?10:8].pubkey;
 if(meta.get(event)?.writable||meta.get(event)?.signer)swapFail();
 return {...compiled,messageBlockhash:bs58.decode(p.blockhash),intent:Object.freeze({...intent}),source,destination,intermediates,createSource,createDestination,minimum,priorityFee,expiresAt:p.expiresAt,lastValidBlockHeight:BigInt(p.lastValidBlockHeight)};
}
