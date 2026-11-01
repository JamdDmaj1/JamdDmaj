// Compound read-only rehearsal: ephemeral mint creation then pool initialization.
// Never calls a wallet, sendTransaction, approveAndSubmit or any write RPC.
import {createSolanaRpc,address,getTransactionDecoder,getCompiledTransactionMessageDecoder,decompileTransactionMessage,appendTransactionMessageInstructions,compileTransaction,getTransactionEncoder,getBase64Decoder,setTransactionMessageLifetimeUsingBlockhash,setTransactionMessageFeePayer,createTransactionMessage} from '@solana/kit';
import {findAssociatedTokenPda,TOKEN_2022_PROGRAM_ADDRESS} from '@solana-program/token-2022';
import {prepareTokenCreation,TOKEN_CREATOR_RPC} from '../lib/token-creator.js';
import {prepareCpmmPool} from '../lib/cpmm-pool.js';
const owner=address(process.argv[2]||''),nativeFetch=globalThis.fetch;
const allowed=new Set(['getGenesisHash','getMinimumBalanceForRentExemption','getLatestBlockhash','getAccountInfo','simulateTransaction']);
let capturedMintWire,mintInfo,sourceInfo,mintAddress,sourceAddress,stage='mint',passed=false;
const rpc=createSolanaRpc(TOKEN_CREATOR_RPC);
async function raw(q){if(!allowed.has(q.method))throw Error('READONLY_FORBIDDEN_RPC');const r=await nativeFetch(TOKEN_CREATOR_RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(q),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('READONLY_HTTP_'+r.status);return r.json();}
globalThis.fetch=async(url,options)=>{
 if(String(url)!==TOKEN_CREATOR_RPC)throw Error('READONLY_ENDPOINT');const q=JSON.parse(options.body);if(!allowed.has(q.method))throw Error('READONLY_FORBIDDEN_RPC');
 let response;
 if(stage==='pool'&&q.method==='getAccountInfo'&&[mintAddress,sourceAddress].includes(q.params[0])){
  // Hypothetical state is obtained from real mint simulation, never invented.
  response={jsonrpc:'2.0',id:q.id,result:{context:{slot:1},value:q.params[0]===mintAddress?mintInfo:sourceInfo}};
 }else if(stage==='pool'&&q.method==='simulateTransaction'){
  const decode=wire=>decompileTransactionMessage(getCompiledTransactionMessageDecoder().decode(getTransactionDecoder().decode(Buffer.from(wire,'base64')).messageBytes));
  const mint=decode(capturedMintWire),pool=decode(q.params[0]);
  const lifetime=(await rpc.getLatestBlockhash({commitment:'confirmed'}).send()).value;
  const instructions=[...mint.instructions,...pool.instructions.filter(i=>i.programAddress!=='ComputeBudget111111111111111111111111111111')];
  const tx=compileTransaction(appendTransactionMessageInstructions(instructions,setTransactionMessageLifetimeUsingBlockhash(lifetime,setTransactionMessageFeePayer(owner,createTransactionMessage({version:0})))));
  const wire=getTransactionEncoder().encode(tx);if(wire.length>1232)throw Error('READONLY_COMPOUND_SIZE');
  response=await raw({jsonrpc:'2.0',id:q.id,method:'simulateTransaction',params:[getBase64Decoder().decode(wire),{encoding:'base64',sigVerify:false,commitment:'confirmed'}]});
  if(response.error||response.result?.value?.err!==null)throw Error('READONLY_CHAIN_SIMULATION '+JSON.stringify(response.error||response.result?.value?.err));
  passed=true;console.log(JSON.stringify({readOnly:true,submitted:false,walletInvoked:false,compoundMintAndPool:true,wireBytes:wire.length,simulationError:null,networkFeeLamports:String(response.result.value.fee),unitsConsumed:response.result.value.unitsConsumed}));
  throw Error('READONLY_SIMULATION_COMPLETE');
 }else{
  if(q.method==='simulateTransaction')capturedMintWire=q.params[0];
  response=await raw(q);
 }
 return new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}});
};
try{
 const account={address:owner,chains:['solana:mainnet']},wallet={accounts:[account],features:{'solana:signTransaction':{supportedTransactionVersions:[0],signTransaction:()=>{throw Error('READONLY_WALLET_FORBIDDEN');}}}};
 const journal={read:()=>null,save:()=>{throw Error('READONLY_STORAGE_FORBIDDEN');}};
 const c=await prepareTokenCreation({identity:{name:'JamdDmaj simulation',symbol:'JAMD',supply:'100000000',decimals:6},wallet,account,journal});mintAddress=c.review.mint;
 [sourceAddress]=await findAssociatedTokenPda({owner,mint:mintAddress,tokenProgram:TOKEN_2022_PROGRAM_ADDRESS});
 const result=await raw({jsonrpc:'2.0',id:1,method:'simulateTransaction',params:[capturedMintWire,{encoding:'base64',sigVerify:false,commitment:'confirmed',accounts:{encoding:'base64',addresses:[mintAddress,sourceAddress]}}]});
 if(result.result?.value?.err!==null||!result.result.value.accounts?.every(Boolean))throw Error('READONLY_MINT_STATE');
 [mintInfo,sourceInfo]=result.result.value.accounts;stage='pool';
 try{await prepareCpmmPool({mint:mintAddress,tokenAmount:'1000000',usdcAmount:'1',wallet,account,journal});}catch(e){if(!passed)throw e;}
 if(!passed)throw Error('READONLY_NOT_COMPLETED');
}finally{globalThis.fetch=nativeFetch;}
