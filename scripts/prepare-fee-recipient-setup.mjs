// Read-only operator preparation; cannot sign or submit any transaction.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {preparePerpsFeeRecipientSetup} from '../lib/perps-fee-recipient-setup.js';
const allowed=new Set(['getGenesisHash','getMultipleAccounts','getLatestBlockhash','getMinimumBalanceForRentExemption','getFeeForMessage','simulateTransaction']);
async function request(method,params){
 if(!allowed.has(method))throw Error('READ_ONLY_SETUP_RPC_REQUIRED');
 const response=await fetch('https://api.mainnet-beta.solana.com',{method:'POST',redirect:'error',
  headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(5000)});
 if(!response.ok||response.redirected)throw Error('SETUP_RPC_UNAVAILABLE');
 const text=await response.text();if(text.length>100000)throw Error('SETUP_RPC_UNAVAILABLE');
 const reply=JSON.parse(text);if(reply.jsonrpc!=='2.0'||reply.id!==1||reply.error||!Object.hasOwn(reply,'result'))throw Error('SETUP_RPC_UNAVAILABLE');return reply.result;
}
const packet=await preparePerpsFeeRecipientSetup({request});
const directory=resolve(import.meta.dirname,'..','.perps-build');await mkdir(directory,{recursive:true});
const output=join(directory,'fee-recipient-setup-'+Date.now()+'.unsigned.json');
await writeFile(output,JSON.stringify(packet,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({output,stage:packet.stage,owner:packet.owner,destination:packet.destination,
 rentReserveLamports:packet.rentReserveLamports,networkFeeLamports:packet.networkFeeLamports,estimatedTotalLamports:packet.estimatedTotalLamports,
 signed:false,submitted:false}));
