// Read-only diagnostic. No signer, private key, journal, or broadcast method.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import bs58 from 'bs58';
import {address,appendTransactionMessageInstructions,compileTransaction,compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,getTransactionEncoder,setTransactionMessageFeePayer,setTransactionMessageLifetimeUsingBlockhash} from '@solana/kit';

const SOL='So11111111111111111111111111111111111111112';
const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUP='JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const COMPUTE='ComputeBudget111111111111111111111111111111';
const ALLOWED=new Set(['getGenesisHash','getMultipleAccounts','getFeeForMessage','getMinimumBalanceForRentExemption','simulateTransaction']);
export async function readOnlyRpc(method,params=[],fetchImpl=fetch) {
  assert.ok(ALLOWED.has(method),'RPC method is not read-only or not required');
  const response=await fetchImpl('https://api.mainnet-beta.solana.com',{method:'POST',redirect:'error',
    signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  if(response.status!==200)throw Error('RPC_HTTP_'+response.status);
  const data=await response.json();
  if(data.error)throw Error('RPC_CODE_'+data.error.code);
  assert.equal(data.id,1);assert.equal(data.jsonrpc,'2.0');assert.ok(Object.hasOwn(data,'result'));
  return data.result;
}
export async function probe(taker,amount='1000000',{fetchImpl=fetch}={}) {
  address(taker);assert.equal(bs58.decode(taker).length,32);
  assert.match(amount,/^[1-9]\d{0,7}$/);assert.ok(BigInt(amount)<=10000000n,'Diagnostic cap is 0.01 SOL');
  let stage='network';
  const rpc=(m,p=[])=>readOnlyRpc(m,p,fetchImpl);
  try {
    assert.equal(await rpc('getGenesisHash'),'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
    stage='quote';
    const url='https://www.jamddmaj.com/api/swap-build?'+new URLSearchParams({inputMint:SOL,outputMint:USDC,amount,taker,slippageBps:'50'});
    const response=await fetchImpl(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,200);
    const envelope=await response.json(),p=envelope.preparation;
    assert.equal(envelope.ok,true);assert.equal(p.taker,taker);assert.equal(p.inputMint,SOL);assert.equal(p.outputMint,USDC);
    assert.equal(p.inAmount,amount);assert.equal(p.executable,false);
    stage='lookup';
    const tables={};
    if(p.lookupTableAddresses.length) {
      const result=await rpc('getMultipleAccounts',[p.lookupTableAddresses,{commitment:'confirmed',encoding:'base64'}]);
      for(let i=0;i<p.lookupTableAddresses.length;i++) {
        const value=result.value[i];assert.equal(value.owner,'AddressLookupTab1e1111111111111111111111111');
        const bytes=Buffer.from(value.data[0],'base64');assert.equal(bytes.readUInt32LE(0),1);
        assert.equal(bytes.readBigUInt64LE(4),18446744073709551615n);assert.equal((bytes.length-56)%32,0);
        tables[p.lookupTableAddresses[i]]=[];
        for(let offset=56;offset<bytes.length;offset+=32)tables[p.lookupTableAddresses[i]].push(address(bs58.encode(bytes.subarray(offset,offset+32))));
      }
    }
    stage='compile';
    const raw=p.instructions.map(i=>({programAddress:address(i.programId),data:Buffer.from(i.data,'base64'),
      accounts:i.accounts.map(a=>{assert.ok(!a.isSigner||a.pubkey===taker);return {address:address(a.pubkey),role:(a.isWritable?1:0)+(a.isSigner?2:0)};})}));
    if(!raw.some(i=>i.programAddress===COMPUTE&&i.data[0]===2)) {
      const data=Buffer.alloc(5);data[0]=2;data.writeUInt32LE(1400000,1);
      raw.unshift({programAddress:address(COMPUTE),accounts:[],data});
    }
    const jup=raw.find(i=>i.programAddress===JUP);assert.ok(jup);
    const shared=Buffer.from(jup.data.subarray(0,8)).equals(Buffer.from([209,152,83,147,124,254,216,233]));
    const source=jup.accounts[shared?2:1].address,destination=jup.accounts[shared?5:2].address;
    let message=createTransactionMessage({version:0});message=setTransactionMessageFeePayer(address(taker),message);
    message=setTransactionMessageLifetimeUsingBlockhash({blockhash:p.blockhash,lastValidBlockHeight:BigInt(p.lastValidBlockHeight)},message);
    message=appendTransactionMessageInstructions(raw,message);
    message=compressTransactionMessageUsingAddressLookupTables(message,tables);
    const tx=compileTransaction(message),wire=Buffer.from(getTransactionEncoder().encode(tx));
    assert.equal(wire[0],1);assert.ok(wire.subarray(1,65).every(b=>b===0));assert.ok(wire.length<=1232);
    stage='before';
    const before=await rpc('getMultipleAccounts',[[taker,source,destination],{commitment:'confirmed',encoding:'base64',dataSlice:{offset:0,length:166}}]);
    stage='fee';
    const fee=await rpc('getFeeForMessage',[Buffer.from(tx.messageBytes).toString('base64'),{commitment:'confirmed',minContextSlot:before.context.slot}]);
    assert.ok(Number.isSafeInteger(fee.value)&&fee.value>0);
    stage='rent';const rent=await rpc('getMinimumBalanceForRentExemption',[165,{commitment:'confirmed'}]);
    stage='simulation';
    const simulation=await rpc('simulateTransaction',[wire.toString('base64'),{encoding:'base64',commitment:'confirmed',sigVerify:false,
      replaceRecentBlockhash:false,minContextSlot:fee.context.slot,accounts:{encoding:'base64',addresses:[taker,source,destination]}}]);
    const value=simulation.value;
    const tokenAmount=a=>a&&Buffer.from(a.data[0],'base64').length>=72?Buffer.from(a.data[0],'base64').readBigUInt64LE(64).toString():null;
    const account=a=>a?{lamports:a.lamports,owner:a.owner,dataBytes:Buffer.from(a.data[0],'base64').length,tokenAmount:tokenAmount(a)}:null;
    return {stage,error:value.err,units:value.unitsConsumed,fee:fee.value,rent,minimum:p.minimumOut,
      before:before.value.map((a,i)=>i===0?(a?{lamports:a.lamports}:null):account(a)),
      after:value.accounts?.map((a,i)=>i===0?(a?{lamports:a.lamports}:null):account(a)),
      signed:false,submitted:false};
  }catch(error){return {stage,error:error.message,signed:false,submitted:false};}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(await probe(process.argv[2],process.argv[3]),null,2));
