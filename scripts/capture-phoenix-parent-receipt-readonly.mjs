// Bounded public protocol fixture capture. No wallet key or network send route.
import {getCompiledTransactionMessageDecoder} from '@solana/kit';
const RPC='https://solana-rpc.publicnode.com',PERMISSION='6UCimUpRW2CGh3ESJm3S59c4WcCaVLYcpPPbbrfX2nzr';
const allowed=new Set(['getGenesisHash','getSignaturesForAddress','getTransaction']);
async function read(method,params){
 if(!allowed.has(method))throw Error('READ_ONLY_RPC');
 const response=await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
 const body=await response.json();if(!response.ok||body.error)throw Error('PUBLIC_RPC_READ_FAILED');return body.result;
}
if(await read('getGenesisHash',[])!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('WRONG_NETWORK');
let before;const seen=new Set();
for(let page=0;page<8;page++){
const recent=await read('getSignaturesForAddress',[PERMISSION,{limit:8,commitment:'finalized',...(before?{before}:{})}]);
if(!recent.length||seen.has(recent.at(-1).signature))break;
for(const row of recent){
 if(seen.has(row.signature))continue;seen.add(row.signature);
 if(row.err!==null)continue;
 const tx=await read('getTransaction',[row.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);
 if(!tx||tx.meta?.err!==null)continue;
 const wire=Buffer.from(tx.transaction[0],'base64');if(wire[0]!==2)continue;
 const message=getCompiledTransactionMessageDecoder().decode(wire.subarray(129));
 if(message.version!=='legacy'||message.instructions.length!==2)continue;
 const data=Buffer.from(message.instructions[0].data);
 if(data.length!==18||data.subarray(0,8).toString('hex')!=='4bf3e0a701053320'||data.readUInt32LE(8)!==32)continue;
 const accounts=message.instructions[0].accountIndices;
 const sponsored=message.staticAccounts[accounts[3]]!==message.staticAccounts[accounts[4]];
 if(message.staticAccounts[accounts[3]]!==message.staticAccounts[0]||sponsored&&!process.argv.includes('--allow-sponsored-fixture'))continue;
 console.log(JSON.stringify({source:{rpc:RPC,method:'getTransaction',encoding:'base64',commitment:'finalized',capturedReadOnly:true,sponsoredFixtureOnly:sponsored},signature:row.signature,transaction:tx}));
 process.exit(0);
}
before=recent.at(-1).signature;
}
throw Error('NO_MATCHING_PUBLIC_PARENT_FIXTURE');
