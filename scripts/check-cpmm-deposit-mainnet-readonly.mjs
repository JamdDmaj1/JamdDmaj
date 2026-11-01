// Read-only real-chain simulation of wrapping test SOL and depositing into an
// existing canonical WSOL/USDC CPMM pool. No wallet signature or broadcast.
import {address,createNoopSigner,createSolanaRpc,createTransactionMessage,setTransactionMessageFeePayer,setTransactionMessageLifetimeUsingBlockhash,appendTransactionMessageInstructions,compileTransaction,getTransactionEncoder,getTransactionDecoder,getBase64Decoder,getCompiledTransactionMessageDecoder,decompileTransactionMessage} from '@solana/kit';
import {getCreateAssociatedTokenIdempotentInstructionAsync,findAssociatedTokenPda,getSyncNativeInstruction} from '@solana-program/token-2022';
import {getTransferSolInstruction} from '@solana-program/system';
import {TOKEN,prepareCpmmPool} from '../lib/cpmm-pool.js';
import {TOKEN_CREATOR_RPC} from '../lib/token-creator.js';
const owner=address(process.argv[2]||''),payer=createNoopSigner(owner),mint=address('So11111111111111111111111111111111111111112');
const nativeFetch=globalThis.fetch,allowed=new Set(['getGenesisHash','getLatestBlockhash','getAccountInfo','simulateTransaction']);
const [source]=await findAssociatedTokenPda({owner,mint,tokenProgram:TOKEN});let virtualSource=null,passed=false;
async function raw(q){if(!allowed.has(q.method))throw Error('READONLY_FORBIDDEN_RPC');const r=await nativeFetch(TOKEN_CREATOR_RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(q),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('READONLY_HTTP_'+r.status);return r.json();}
const rpc=createSolanaRpc(TOKEN_CREATOR_RPC);
const prefix=[await getCreateAssociatedTokenIdempotentInstructionAsync({payer,owner,mint,tokenProgram:TOKEN}),getTransferSolInstruction({source:payer,destination:source,amount:1000000n}),getSyncNativeInstruction({account:source},{programAddress:TOKEN})];
globalThis.fetch=async(url,options)=>{
 if(String(url)!==TOKEN_CREATOR_RPC)throw Error('READONLY_ENDPOINT');const q=JSON.parse(options.body);if(!allowed.has(q.method))throw Error('READONLY_FORBIDDEN_RPC');let response;
 if(q.method==='getAccountInfo'&&q.params[0]===source&&virtualSource)response={jsonrpc:'2.0',id:q.id,result:{context:{slot:1},value:virtualSource}};
 else if(q.method==='simulateTransaction'&&virtualSource){
  const decompiled=decompileTransactionMessage(getCompiledTransactionMessageDecoder().decode(getTransactionDecoder().decode(Buffer.from(q.params[0],'base64')).messageBytes));
  const lifetime=(await rpc.getLatestBlockhash({commitment:'confirmed'}).send()).value;
  const tx=compileTransaction(appendTransactionMessageInstructions([...prefix,...decompiled.instructions],setTransactionMessageLifetimeUsingBlockhash(lifetime,setTransactionMessageFeePayer(owner,createTransactionMessage({version:0})))));
  const wire=getTransactionEncoder().encode(tx);if(wire.length>1232)throw Error('READONLY_SIZE');
  response=await raw({jsonrpc:'2.0',id:q.id,method:'simulateTransaction',params:[getBase64Decoder().decode(wire),{encoding:'base64',sigVerify:false,commitment:'confirmed'}]});
  if(response.error||response.result?.value?.err!==null)throw Error('READONLY_CHAIN_SIMULATION '+JSON.stringify(response.error||response.result?.value?.err));
  passed=true;console.log(JSON.stringify({readOnly:true,submitted:false,walletInvoked:false,depositIntoExistingPool:true,wireBytes:wire.length,simulationError:null,unitsConsumed:response.result.value.unitsConsumed}));throw Error('READONLY_SIMULATION_COMPLETE');
 }else response=await raw(q);
 return new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}});
};
try{
 const lifetime=(await rpc.getLatestBlockhash({commitment:'confirmed'}).send()).value;
 const tx=compileTransaction(appendTransactionMessageInstructions(prefix,setTransactionMessageLifetimeUsingBlockhash(lifetime,setTransactionMessageFeePayer(owner,createTransactionMessage({version:0})))));
 const result=await raw({jsonrpc:'2.0',id:1,method:'simulateTransaction',params:[getBase64Decoder().decode(getTransactionEncoder().encode(tx)),{encoding:'base64',sigVerify:false,commitment:'confirmed',accounts:{encoding:'base64',addresses:[source]}}]});
 if(result.result?.value?.err!==null||!result.result.value.accounts?.[0])throw Error('READONLY_PREFIX');virtualSource=result.result.value.accounts[0];
 const account={address:owner,chains:['solana:mainnet']},wallet={accounts:[account],features:{'solana:signTransaction':{supportedTransactionVersions:[0],signTransaction:()=>{throw Error('READONLY_WALLET_FORBIDDEN');}}}};
 try{await prepareCpmmPool({mint,tokenAmount:'0.001',usdcAmount:'1',wallet,account,journal:{read:()=>null,save:()=>{throw Error('READONLY_STORAGE_FORBIDDEN');}}});}catch(e){if(!passed)throw e;}
 if(!passed)throw Error('READONLY_NOT_COMPLETED');
}finally{globalThis.fetch=nativeFetch;}
