import {address,createSolanaRpc,createNoopSigner,generateKeyPairSigner,createTransactionMessage,setTransactionMessageFeePayer,setTransactionMessageLifetimeUsingBlockhash,appendTransactionMessageInstructions,compileTransaction,partiallySignTransactionWithSigners,getTransactionEncoder,getTransactionDecoder,getBase64Decoder} from '@solana/kit';
import {getCreateAccountInstruction} from '@solana-program/system';
import {TOKEN_2022_PROGRAM_ADDRESS,getCreateAssociatedTokenInstructionAsync,getInitializeMint2Instruction,getMintToCheckedInstruction,getSetAuthorityInstruction,AuthorityType} from '@solana-program/token-2022';
import {prepareDevnetMetadata} from './devnet-token-metadata.js';
import {fairLaunchComputeBudget} from './solana-devnet-token.js';
import {assertFairLaunchMessage,fairLaunchOwnerSignature} from './fair-launch-transaction.js';
import {fairLaunchCostReview} from './fair-launch-costs.js';

export const TOKEN_CREATOR_CHAIN='solana:mainnet';
export const TOKEN_CREATOR_RPC='https://solana-rpc.publicnode.com';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const KEY='jamd.tokenCreator.mainnet.pending.v1';
function fail(code){throw Error(code);}
async function messageHash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export function tokenCreatorIdentity(input){
 const name=String(input?.name||'').trim(),symbol=String(input?.symbol||'').trim();
 if(!name||new TextEncoder().encode(name).length>60||!/^[A-Za-z0-9]{1,10}$/.test(symbol))fail('TOKEN_IDENTITY');
 const decimals=Number(input.decimals);
 if(!Number.isInteger(decimals)||decimals<0||decimals>9||typeof input.supply!=='string'||!/^[1-9][0-9]{0,19}$/.test(input.supply))fail('TOKEN_SUPPLY');
 const amount=BigInt(input.supply)*10n**BigInt(decimals);
 if(amount>18446744073709551615n)fail('TOKEN_SUPPLY');
 return Object.freeze({name,symbol,decimals,supply:input.supply,amount});
}
export function tokenCreatorJournal(storage){
 return {
  read(){const text=storage.getItem(KEY);if(!text)return null;const r=JSON.parse(text);if(r.chain!==TOKEN_CREATOR_CHAIN||!r.signature||!r.mint||!r.owner||!/^\d{1,18}$/.test(r.lastValidBlockHeight)||!/^[a-f0-9]{64}$/.test(r.messageHash))fail('TOKEN_JOURNAL');address(r.mint);address(r.owner);tokenCreatorIdentity({name:r.name,symbol:r.symbol,supply:r.supply,decimals:r.decimals});if(!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(r.signature))fail('TOKEN_JOURNAL');return r;},
  save(record){if(this.read())fail('TOKEN_PENDING');const text=JSON.stringify(record);storage.setItem(KEY,text);if(storage.getItem(KEY)!==text)fail('TOKEN_JOURNAL');this.read();},
  finish(signature,state){if(!['confirmed','failed','expired'].includes(state))fail('TOKEN_JOURNAL');const r=this.read();if(r?.signature!==signature)fail('TOKEN_JOURNAL');const historyKey=KEY+'.history';const history=JSON.parse(storage.getItem(historyKey)||'[]');if(!Array.isArray(history))fail('TOKEN_JOURNAL');const text=JSON.stringify([...history.slice(-19),{...r,state,observedAt:Date.now()}]);storage.setItem(historyKey,text);if(storage.getItem(historyKey)!==text)fail('TOKEN_JOURNAL');storage.removeItem(KEY);}
 };
}
export async function prepareTokenCreation({identity,wallet,account,journal,now=Date.now}){
 const token=tokenCreatorIdentity(identity),feature=wallet?.features?.['solana:signTransaction'];
 if(!feature?.signTransaction||!feature.supportedTransactionVersions?.includes(0)||!account?.chains?.includes(TOKEN_CREATOR_CHAIN))fail('TOKEN_WALLET_MAINNET');
 if(journal.read())fail('TOKEN_PENDING');
 const rpc=createSolanaRpc(TOKEN_CREATOR_RPC);
 if(await rpc.getGenesisHash().send()!==GENESIS)fail('TOKEN_NETWORK');
 const owner=address(account.address),payer=createNoopSigner(owner),mint=await generateKeyPairSigner(false);
 const metadata=prepareDevnetMetadata({projectName:token.name,symbol:token.symbol},mint.address,payer);
 const rent=await rpc.getMinimumBalanceForRentExemption(metadata.rentSpace).send();
 const lifetime=(await rpc.getLatestBlockhash({commitment:'confirmed'}).send()).value;
 const ata=await getCreateAssociatedTokenInstructionAsync({payer,owner,mint:mint.address,tokenProgram:TOKEN_2022_PROGRAM_ADDRESS});
 const instructions=[...fairLaunchComputeBudget(),getCreateAccountInstruction({payer,newAccount:mint,lamports:rent,space:metadata.mintSpace,programAddress:TOKEN_2022_PROGRAM_ADDRESS}),metadata.pointerInstruction,getInitializeMint2Instruction({mint:mint.address,decimals:token.decimals,mintAuthority:owner,freezeAuthority:null}),metadata.metadataInstruction,metadata.sealInstruction,ata,getMintToCheckedInstruction({mint:mint.address,token:ata.accounts[1].address,mintAuthority:owner,amount:token.amount,decimals:token.decimals}),getSetAuthorityInstruction({owned:mint.address,owner,authorityType:AuthorityType.MintTokens,newAuthority:null})];
 const message=appendTransactionMessageInstructions(instructions,setTransactionMessageLifetimeUsingBlockhash(lifetime,setTransactionMessageFeePayer(owner,createTransactionMessage({version:0}))));
 const compiled=compileTransaction(message),simulationTx=await partiallySignTransactionWithSigners([mint],compiled);
 const simulation=await rpc.simulateTransaction(getBase64Decoder().decode(getTransactionEncoder().encode(simulationTx)),{encoding:'base64',sigVerify:false,commitment:'confirmed'}).send();
 const costs=fairLaunchCostReview(simulation,{kind:'create',owner,now:now()});
 const review=Object.freeze({...costs,cluster:TOKEN_CREATOR_CHAIN,name:token.name,symbol:token.symbol,supply:token.supply,decimals:token.decimals,mint:String(mint.address),recipient:String(owner),mintAuthorityRevoked:true,freezeAuthorityDisabled:true,immutableMetadata:true,liquidityCreated:false,vestingCreated:false,platformFeeLamports:'0'});
 let consumed=false;
 return Object.freeze({review,async approveAndSubmit({explicitApproval=false}={}){
  if(consumed)fail('TOKEN_REVIEW_CONSUMED');
  if(explicitApproval!==true)fail('TOKEN_APPROVAL_REQUIRED');
  consumed=true;
  if(now()>=review.expiresAt||journal.read())fail('TOKEN_REVIEW_EXPIRED_OR_PENDING');
  if(account.address!==owner||!wallet.accounts?.some(a=>a.address===owner&&a.chains?.includes(TOKEN_CREATOR_CHAIN)))fail('TOKEN_WALLET_CHANGED');
  if(await rpc.getGenesisHash().send()!==GENESIS)fail('TOKEN_NETWORK');
  const [result]=await feature.signTransaction({account,chain:TOKEN_CREATOR_CHAIN,transaction:getTransactionEncoder().encode(compiled),options:{preflightCommitment:'confirmed'}});
  const signed=getTransactionDecoder().decode(result?.signedTransaction);assertFairLaunchMessage(compiled,signed);
  if(now()>=review.expiresAt)fail('TOKEN_REVIEW_EXPIRED');
  const final=await partiallySignTransactionWithSigners([mint],signed),signature=fairLaunchOwnerSignature(final,owner);
  journal.save({chain:TOKEN_CREATOR_CHAIN,signature,mint:String(mint.address),owner:String(owner),name:token.name,symbol:token.symbol,supply:token.supply,decimals:token.decimals,lastValidBlockHeight:String(lifetime.lastValidBlockHeight),messageHash:await messageHash(final.messageBytes)});
  const sent=await rpc.sendTransaction(getBase64Decoder().decode(getTransactionEncoder().encode(final)),{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0n}).send();
  if(sent!==signature)fail('TOKEN_SIGNATURE_MISMATCH');
  return {state:'pending',signature,mint:String(mint.address)};
 }});
}

// Read-only reconciliation, never a resend. Missing history is not proof of failure.
export async function readTokenCreation(journal){
 const pending=journal.read();if(!pending)return null;
 const rpc=createSolanaRpc(TOKEN_CREATOR_RPC);if(await rpc.getGenesisHash().send()!==GENESIS)fail('TOKEN_NETWORK');
 const status=(await rpc.getSignatureStatuses([pending.signature],{searchTransactionHistory:true}).send()).value[0];
 let state='pending';
 if(status?.confirmationStatus==='finalized'){
  const receipt=await rpc.getTransaction(pending.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}).send();
  if(!receipt)return {...pending,state:'pending'};
  if(!Array.isArray(receipt.transaction)||receipt.transaction[1]!=='base64'||!receipt.meta||!Object.hasOwn(receipt.meta,'err')||(receipt.meta.err===null)!==(status.err===null))fail('TOKEN_RECEIPT_INVALID');
  const wire=Uint8Array.from(atob(receipt.transaction[0]),c=>c.charCodeAt(0));
  const transaction=getTransactionDecoder().decode(wire);
  if(await messageHash(transaction.messageBytes)!==pending.messageHash||fairLaunchOwnerSignature(transaction,pending.owner)!==pending.signature)fail('TOKEN_RECEIPT_INVALID');
  if(receipt.meta.err!==null)state='failed';
  else{
   const expected=tokenCreatorIdentity({name:pending.name,symbol:pending.symbol,supply:pending.supply,decimals:pending.decimals});
   if(!receipt.meta.postTokenBalances?.some(b=>b.mint===pending.mint&&b.owner===pending.owner&&b.uiTokenAmount?.amount===expected.amount.toString()&&b.uiTokenAmount.decimals===pending.decimals))fail('TOKEN_RECEIPT_INVALID');
   state='confirmed';
  }
 }
 else if(status===null&&BigInt(await rpc.getBlockHeight({commitment:'finalized'}).send())>BigInt(pending.lastValidBlockHeight)){
  const again=(await rpc.getSignatureStatuses([pending.signature],{searchTransactionHistory:true}).send()).value[0];
  if(again===null&&(await rpc.getAccountInfo(address(pending.mint),{commitment:'finalized',encoding:'base64'}).send()).value===null)state='expired';
 }
 if(state!=='pending')journal.finish(pending.signature,state);
 return {...pending,state};
}
