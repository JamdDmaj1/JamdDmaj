// Only read/simulation RPC methods. Never invokes approveAndSubmit or a wallet.
import {address} from '@solana/kit';
import {prepareTokenCreation,TOKEN_CREATOR_RPC} from '../lib/token-creator.js';
const owner=address(process.argv[2]||'');
const originalFetch=globalThis.fetch,calls=[];
const allowed=new Set(['getGenesisHash','getMinimumBalanceForRentExemption','getLatestBlockhash','simulateTransaction']);
globalThis.fetch=async(url,options)=>{
 if(String(url)!==TOKEN_CREATOR_RPC)throw Error('READONLY_WRONG_ENDPOINT');
 const q=JSON.parse(options.body);if(!allowed.has(q.method))throw Error('READONLY_FORBIDDEN_RPC');calls.push(q.method);
 return originalFetch(url,{...options,signal:AbortSignal.timeout(15000)});
};
try{
 const account={address:owner,chains:['solana:mainnet']};
 const wallet={accounts:[account],features:{'solana:signTransaction':{supportedTransactionVersions:[0],signTransaction:()=>{throw Error('READONLY_WALLET_FORBIDDEN');}}}};
 const result=await prepareTokenCreation({identity:{name:'JamdDmaj simulation',symbol:'JAMD',supply:'100000000',decimals:6},wallet,account,journal:{read:()=>null,save:()=>{throw Error('READONLY_SAVE_FORBIDDEN');}}});
 const r=result.review;
 console.log(JSON.stringify({readOnly:true,submitted:false,walletInvoked:false,cluster:r.cluster,networkFeeLamports:r.networkFeeLamports,accountReservesLamports:r.accountReservesLamports,estimatedTotalLamports:r.estimatedTotalLamports,methods:calls}));
}finally{globalThis.fetch=originalFetch;}
