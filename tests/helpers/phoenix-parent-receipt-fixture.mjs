// Public historical protocol transaction. Fabricated approval/owner fields are
// only a read-only recovery fixture, never a new consent/signing capability.
import {readFileSync} from 'node:fs';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import bs58 from 'bs58';
import {getCompiledTransactionMessageDecoder,getProgramDerivedAddress,createTransactionMessage,setTransactionMessageFeePayer,setTransactionMessageLifetimeUsingBlockhash,appendTransactionMessageInstructions,compileTransaction,getBase64EncodedWireTransaction} from '@solana/kit';
import {buildRegisterTraderIx,buildOnboardTraderDelegatedIx} from '@ellipsis-labs/rise';
export function phoenixParentReceiptFixture(){
 const f=JSON.parse(readFileSync(new URL('../fixtures/phoenix-parent-finalized.json',import.meta.url),'utf8'));
 const tx=f.transaction,full=Buffer.from(tx.transaction[0],'base64'),message=full.subarray(129),m=getCompiledTransactionMessageDecoder().decode(message);
 const wallet=m.staticAccounts[0],parent=m.staticAccounts[m.instructions[0].accountIndices[5]],hash=createHash('sha256').update(message).digest('hex');
 const partial=Buffer.from(full);partial.fill(0,65,129);const unsigned=Buffer.from(full);unsigned.fill(0,1,129);
 const created=tx.blockTime*1000-1000,preparation={stage:'PHOENIX_PARENT_UNSIGNED',walletAddress:wallet,parentAddress:parent,onboarder:m.staticAccounts[1],maxPositions:32,
  messageBase64:message.toString('base64'),messageHash:hash,lastValidBlockHeight:10000,serializedTxBase64:unsigned.toString('base64')};
 const simulation={stage:'PHOENIX_PARENT_SIMULATED',walletAddress:wallet,parentAddress:parent,messageHash:hash,networkFeeLamports:'10000',rentLockedLamports:'8371840',maximumLamports:'8381840',observedSlot:tx.slot-1};
 const row={id:createHash('sha256').update('PUBLIC_READ_ONLY:'+f.signature).digest('hex'),owner:'a'.repeat(64),wallet,revision:'historical-fixture',phase:'PARENT',parent,
  message:preparation.messageBase64,message_hash:hash,last_height:'10000',maximum_lamports:'8381840',expires:created+300000,preparation:JSON.stringify(preparation),simulation:JSON.stringify(simulation),
  state:'UNKNOWN',signature:f.signature,signed:partial.toString('base64'),receipt:null,created,updated:created};
 const calls=[],request=async(method,params)=>{calls.push({method,params});
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSignatureStatuses')return {context:{slot:tx.slot},value:[{slot:tx.slot,confirmationStatus:'finalized',err:tx.meta.err}]};
  if(method==='getTransaction')return tx;throw Error('NO_SEND_ALLOWED');
 };
 return {row,tx,request,calls,now:()=>tx.blockTime*1000+86400000};
}
export async function syntheticSameWalletParentFixture(){
 const f=phoenixParentReceiptFixture(),keys=generateKeyPairSync('ed25519'),wallet=bs58.encode(keys.publicKey.export({format:'der',type:'spki'}).subarray(-32));
 const programAddress='EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih',old=getCompiledTransactionMessageDecoder().decode(Buffer.from(f.row.message,'base64'));
 const [parent]=await getProgramDerivedAddress({programAddress,seeds:['trader',bs58.decode(wallet),new Uint8Array([0]),new Uint8Array([0])]});
 const protocol={programAddress,logAuthorityAddress:'GdxfTLSsdSY37G6fZoYtdGDSfgFnbT2EmRpuePZxWShS',globalConfigurationAddress:'2zskx2iyCvb6Stg7RBZkt1f6MrF4dpYtMG3yMvKwqtUZ'};
 const ix=[buildRegisterTraderIx({...protocol,payer:wallet,trader:wallet,traderAccount:parent,maxPositions:32n,traderPdaIndex:0,traderSubaccountIndex:0}),
  buildOnboardTraderDelegatedIx({...protocol,authority:old.staticAccounts[1],permissionAccount:'6UCimUpRW2CGh3ESJm3S59c4WcCaVLYcpPPbbrfX2nzr',traderAccount:parent,
   globalTraderIndex:[old.staticAccounts[old.instructions[1].accountIndices[6]]],activeTraderBuffer:[old.staticAccounts[old.instructions[1].accountIndices[7]]]})];
 let m=createTransactionMessage({version:'legacy'});m=setTransactionMessageFeePayer(wallet,m);m=setTransactionMessageLifetimeUsingBlockhash({blockhash:bs58.encode(Buffer.alloc(32,7)),lastValidBlockHeight:10000n},m);m=appendTransactionMessageInstructions(ix,m);
 const unsigned=getBase64EncodedWireTransaction(compileTransaction(m)),wire=Buffer.from(unsigned,'base64'),message=wire.subarray(129),hash=createHash('sha256').update(message).digest('hex');
 sign(null,message,keys.privateKey).copy(wire,1);
 f.row={...f.row,wallet,parent,message:message.toString('base64'),message_hash:hash,signature:bs58.encode(wire.subarray(1,65)),signed:wire.toString('base64'),
  preparation:JSON.stringify({...JSON.parse(f.row.preparation),walletAddress:wallet,parentAddress:parent,messageBase64:message.toString('base64'),messageHash:hash,serializedTxBase64:unsigned}),
  simulation:JSON.stringify({...JSON.parse(f.row.simulation),walletAddress:wallet,parentAddress:parent,messageHash:hash})};return f;
}
