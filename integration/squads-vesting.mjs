import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { LiteSVM, FailedTransactionMetadata } from 'litesvm';
import { getTransactionDecoder, createNoopSigner } from '@solana/kit';
import { Keypair, PublicKey, Transaction, TransactionMessage, TransactionInstruction, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';
import * as token from '@solana/spl-token';
import * as squads from '@sqds/multisig';
import { deriveProtectionAddresses, getInitializePolicyInstruction, getInitializeCreatorVestingInstruction, getClaimVestedInstruction } from '../lib/solana-devnet-token.js';
import { prepareDevnetMetadata } from '../lib/devnet-token-metadata.js';

// Real programs, ephemeral keys, local ledger only. RPC is used only to read the Squads binary/config.
const svm = new LiteSVM();
const program = squads.PROGRAM_ID;
const lockProgram = 'FzH2QN9NFFrpwsn8xqLT83BZ7ruqmMBiwY4CU6MkLVQ4';
const evidence = {scope:'local-svm-squads-vesting',sentNetworkTransactions:0,cases:[]};
const plan=JSON.parse(readFileSync(new URL('../security/jamd-allocation-plan.json',import.meta.url)));
const intent=JSON.parse(readFileSync(new URL('../security/jamd-mainnet-intent.json',import.meta.url)));
const scale=10n**BigInt(intent.token.decimals);
const supply=BigInt(plan.totalTokens)*scale;
assert.equal(plan.totalTokens,intent.token.totalSupply);
async function rpcAccount(key) {
  const r=await fetch('https://api.mainnet-beta.solana.com',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getAccountInfo',params:[key.toString(),{encoding:'base64',commitment:'finalized'}]})});
  const j=await r.json(); if(!r.ok||j.error||!j.result?.value)throw Error('RPC account unavailable: '+key);
  return {...j.result.value,data:Buffer.from(j.result.value.data[0],'base64')};
}
const programAccount=await rpcAccount(program);
assert.equal(programAccount.owner,'BPFLoaderUpgradeab1e11111111111111111111111');
assert.equal(programAccount.data.readUInt32LE(0),2);
const programData=await rpcAccount(new PublicKey(programAccount.data.subarray(4,36)));
assert.equal(programData.data.readUInt32LE(0),3);
const binary=programData.data.subarray(45);
evidence.squadsBinarySha256=createHash('sha256').update(binary).digest('hex');
svm.addProgram(program.toBase58(),binary);
const lockBinary=readFileSync(new URL('../onchain/target/deploy/jamddmaj_lock.so',import.meta.url));
evidence.lockBinarySha256=createHash('sha256').update(lockBinary).digest('hex');
svm.addProgram(lockProgram,lockBinary);
const [configPda]=squads.getProgramConfigPda({});
const configAccount=await rpcAccount(configPda);
svm.setAccount({address:configPda.toBase58(),data:configAccount.data,executable:false,lamports:BigInt(configAccount.lamports),programAddress:program.toBase58(),space:BigInt(configAccount.data.length)});
const [config]=squads.accounts.ProgramConfig.deserialize(configAccount.data);
const members=Array.from({length:3},()=>Keypair.generate());
for(const member of members)svm.airdrop(member.publicKey.toBase58(),100000000000n);
const owner=members[0];
function send(ixs,signers=[owner],expectedError=null) {
  svm.expireBlockhash();
  const tx=new Transaction({feePayer:owner.publicKey,recentBlockhash:svm.latestBlockhash()}).add(ComputeBudgetProgram.setComputeUnitLimit({units:1400000}),...ixs);
  tx.sign(...signers);
  const bytes=tx.serialize();
  assert.ok(bytes.length<=1232,'Transaction must fit Solana packet limit');
  const result=svm.sendTransaction(getTransactionDecoder().decode(bytes));
  if(expectedError){assert.ok(result instanceof FailedTransactionMetadata,'Expected rejection: '+expectedError);assert.match(result.meta().logs().join('\n'),expectedError);}
  else if(result instanceof FailedTransactionMetadata)throw Error(result.toString()+'\n'+result.meta().logs().join('\n'));
  return result;
}
const fromKit=ix=>new TransactionInstruction({programId:new PublicKey(ix.programAddress),keys:ix.accounts.map(a=>({pubkey:new PublicKey(a.address),isSigner:a.role>=2,isWritable:(a.role&1)===1})),data:Buffer.from(ix.data)});
const createKey=Keypair.generate();
const [multisigPda]=squads.getMultisigPda({createKey:createKey.publicKey});
send([squads.instructions.multisigCreateV2({treasury:config.treasury,creator:owner.publicKey,multisigPda,configAuthority:null,threshold:2,members:members.map(m=>({key:m.publicKey,permissions:squads.types.Permissions.all()})),timeLock:86400,createKey:createKey.publicKey,rentCollector:null})],[owner,createKey]);
const connection={getAccountInfo:async key=>{const a=svm.getAccount(key.toBase58());return a.exists?{data:Buffer.from(a.data),owner:new PublicKey(a.programAddress),lamports:Number(a.lamports),executable:a.executable}:null;}};
let transactionIndex=0n;
const now=()=>svm.getClock().unixTimestamp;
function advance(seconds){const clock=svm.getClock();clock.unixTimestamp+=BigInt(seconds);svm.setClock(clock);}
const mint=Keypair.generate();
const source=token.getAssociatedTokenAddressSync(mint.publicKey,owner.publicKey,false,token.TOKEN_2022_PROGRAM_ID);
const metadata=prepareDevnetMetadata({projectName:intent.token.name,symbol:intent.token.symbol},mint.publicKey.toBase58(),createNoopSigner(owner.publicKey.toBase58()));
send([
  SystemProgram.createAccount({fromPubkey:owner.publicKey,newAccountPubkey:mint.publicKey,lamports:Number(svm.minimumBalanceForRentExemption(metadata.rentSpace)),space:Number(metadata.mintSpace),programId:token.TOKEN_2022_PROGRAM_ID}),
  fromKit(metadata.pointerInstruction),
  token.createInitializeMint2Instruction(mint.publicKey,intent.token.decimals,owner.publicKey,null,token.TOKEN_2022_PROGRAM_ID),
  fromKit(metadata.metadataInstruction),fromKit(metadata.sealInstruction),
  token.createAssociatedTokenAccountInstruction(owner.publicKey,source,owner.publicKey,mint.publicKey,token.TOKEN_2022_PROGRAM_ID),
  token.createMintToInstruction(mint.publicKey,source,owner.publicKey,supply,[],token.TOKEN_2022_PROGRAM_ID),
  token.createSetAuthorityInstruction(mint.publicKey,owner.publicKey,token.AuthorityType.MintTokens,null,[],token.TOKEN_2022_PROGRAM_ID)
],[owner,mint]);
const mintState=await token.getMint(connection,mint.publicKey,undefined,token.TOKEN_2022_PROGRAM_ID);
assert.equal(mintState.supply,supply);
assert.equal(mintState.decimals,intent.token.decimals);
assert.equal(mintState.mintAuthority,null);
assert.equal(mintState.freezeAuthority,null);
const identity=await token.getTokenMetadata(connection,mint.publicKey);
assert.equal(identity.name,intent.token.name);
assert.equal(identity.symbol,intent.token.symbol);
assert.ok(!identity.updateAuthority || identity.updateAuthority.equals(PublicKey.default));
const pointer=token.getMetadataPointerState(mintState);
assert.equal(pointer.authority,null);
assert.ok(pointer.metadataAddress.equals(mint.publicKey));
send([token.createMintToInstruction(mint.publicKey,source,owner.publicKey,1n,[],token.TOKEN_2022_PROGRAM_ID)],[owner],/fixed supply|FixedSupply|total supply.*fixed/i);
assert.equal((await token.getMint(connection,mint.publicKey,undefined,token.TOKEN_2022_PROGRAM_ID)).supply,supply);
evidence.creation={name:identity.name,symbol:identity.symbol,supplyBaseUnits:supply.toString(),mintAuthorityRevoked:true,freezeAuthorityDisabled:true,metadataSealed:true,additionalMintRejected:true};
const first=await deriveProtectionAddresses(mint.publicKey.toBase58(),owner.publicKey.toBase58());
send([fromKit(await getInitializePolicyInstruction({ownerAddress:owner.publicKey.toBase58(),mintAddress:mint.publicKey.toBase58(),policyAddress:first.policyAddress}))]);
const allocations=plan.allocations.filter(a=>BigInt(a.lockedTokens)>0n);
const locks=[];
for(const allocation of allocations){
  const [vault]=squads.getVaultPda({multisigPda,index:allocation.vaultIndex});
  svm.airdrop(vault.toBase58(),10000000n);
  const d=await deriveProtectionAddresses(mint.publicKey.toBase58(),vault.toBase58());
  const destination=token.getAssociatedTokenAddressSync(mint.publicKey,vault,true,token.TOKEN_2022_PROGRAM_ID);
  const amount=BigInt(allocation.lockedTokens)*1000000000n;
  send([token.createAssociatedTokenAccountInstruction(owner.publicKey,destination,vault,mint.publicKey,token.TOKEN_2022_PROGRAM_ID),fromKit(await getInitializeCreatorVestingInstruction({ownerAddress:owner.publicKey.toBase58(),beneficiaryAddress:vault.toBase58(),mintAddress:mint.publicKey.toBase58(),sourceAddress:source.toBase58(),policyAddress:d.policyAddress,vestingAddress:d.creatorVestingAddress,vaultAddress:d.creatorVaultAddress,totalAllocation:BigInt(allocation.totalTokens)*1000000000n,lockedAmount:amount}))]);
  const claim=fromKit(await getClaimVestedInstruction({policyAddress:d.policyAddress,beneficiaryAddress:vault.toBase58(),mintAddress:mint.publicKey.toBase58(),vestingAddress:d.creatorVestingAddress,vaultAddress:d.creatorVaultAddress,destinationAddress:destination.toBase58()}));
  locks.push({allocation,vault,destination,claim,amount,start:now(),escrow:new PublicKey(d.creatorVaultAddress),initialBalance:BigInt(allocation.notVestedTokens)*scale});
}
function balance(key){const a=svm.getAccount(key.toBase58());return token.AccountLayout.decode(Buffer.from(a.data)).amount;}
const distribution=[];
for(const allocation of plan.allocations){
  const [vault]=squads.getVaultPda({multisigPda,index:allocation.vaultIndex});
  const destination=token.getAssociatedTokenAddressSync(mint.publicKey,vault,true,token.TOKEN_2022_PROGRAM_ID);
  const amount=BigInt(allocation.notVestedTokens)*scale;
  if(!svm.getAccount(destination.toBase58()).exists){
    send([token.createAssociatedTokenAccountInstruction(owner.publicKey,destination,vault,mint.publicKey,token.TOKEN_2022_PROGRAM_ID)]);
  }
  if(amount>0n)send([token.createTransferCheckedInstruction(source,mint.publicKey,destination,owner.publicKey,amount,intent.token.decimals,[],token.TOKEN_2022_PROGRAM_ID)]);
  assert.equal(balance(destination),amount);
  const lock=locks.find(l=>l.allocation.category===allocation.category);
  const locked=lock?balance(lock.escrow):0n;
  assert.equal(locked,BigInt(allocation.lockedTokens)*scale);
  assert.equal(amount+locked,BigInt(allocation.totalTokens)*scale);
  distribution.push({category:allocation.category,destination,available:amount,locked});
}
assert.equal(balance(source),0n);
assert.equal(distribution.reduce((s,a)=>s+a.available+a.locked,0n),supply);
assert.equal(distribution.reduce((s,a)=>s+a.locked,0n),BigInt(plan.lockedTokens)*scale);
evidence.distribution={sourceEmptied:true,totalReconciled:true,lockedBaseUnits:(BigInt(plan.lockedTokens)*scale).toString(),categories:distribution.map(a=>({category:a.category,notVestedBaseUnits:a.available.toString(),lockedBaseUnits:a.locked.toString()})),publicSaleOpened:false,liquidityProvided:false};
async function proposal(lock){
  const index=++transactionIndex;
  send([squads.instructions.vaultTransactionCreate({multisigPda,transactionIndex:index,creator:owner.publicKey,vaultIndex:lock.allocation.vaultIndex,ephemeralSigners:0,transactionMessage:new TransactionMessage({payerKey:lock.vault,recentBlockhash:svm.latestBlockhash(),instructions:[lock.claim]})}),squads.instructions.proposalCreate({multisigPda,transactionIndex:index,creator:owner.publicKey}),squads.instructions.proposalApprove({multisigPda,transactionIndex:index,member:owner.publicKey})]);
  const {instruction}=await squads.instructions.vaultTransactionExecute({connection,multisigPda,transactionIndex:index,member:owner.publicKey});
  send([instruction],[owner],/InvalidProposalStatus|NotApproved/);
  send([squads.instructions.proposalApprove({multisigPda,transactionIndex:index,member:members[1].publicKey})],[owner,members[1]]);
  send([instruction],[owner],/TimeLockNotReleased/);
  return instruction;
}
for(const lock of locks){
  const ix=await proposal(lock);advance(86401);
  send([ix],[owner],/NothingToClaim/);
  assert.equal(balance(lock.destination),lock.initialBalance);
  evidence.cases.push({category:lock.allocation.category,oneApprovalRejected:true,timelockRejected:true,beforeCliffRejected:true});
}
const firstRelease=locks.reduce((m,l)=>l.start>m?l.start:m,0n)+731n*86400n+(1096n*86400n+35n)/36n;
advance(firstRelease-now());
for(const lock of locks){const ix=await proposal(lock);advance(86401);send([ix]);assert.equal(balance(lock.destination),lock.initialBalance+lock.amount/36n);evidence.cases.push({category:lock.allocation.category,firstTrancheClaimed:true});}
const end=locks.reduce((m,l)=>l.start>m?l.start:m,0n)+(731n+1096n)*86400n;
advance(end-now());
for(const lock of locks){const ix=await proposal(lock);advance(86401);send([ix]);assert.equal(balance(lock.destination),lock.initialBalance+lock.amount);assert.equal(balance(lock.escrow),0n);const again=await proposal(lock);advance(86401);send([again],[owner],/NothingToClaim/);evidence.cases.push({category:lock.allocation.category,fullyReleased:true,doubleClaimRejected:true});}
assert.equal(distribution.reduce((s,a)=>s+balance(a.destination),0n),supply);
console.log(JSON.stringify({...evidence,passed:true},null,2));
