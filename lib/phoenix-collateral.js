// Quote-independent collateral routing and split payout preparation. No custody
// grant, network submission, assumption of finality or automatic queue retry.
import bs58 from 'bs58';
import {decodeGlobalConfiguration,getGlobalTraderIndexAddresses,getActiveTraderBufferAddresses,getExchangeRunningState,
 buildWithdrawFundsIx,getEmberWithdrawEncoder} from '@ellipsis-labs/rise';
import {PHOENIX_IDENTITIES as ID,phoenixKey} from './phoenix-market-plan.js';
import {derivePhoenixWalletAccounts,phoenixExchangeKeyFingerprint} from './phoenix-instruction-bindings.js';
import {requireFreshPhoenixChainAccount} from './phoenix-chain-account.js';

const GLOBAL='2zskx2iyCvb6Stg7RBZkt1f6MrF4dpYtMG3yMvKwqtUZ',LOG='GdxfTLSsdSY37G6fZoYtdGDSfgFnbT2EmRpuePZxWShS';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const SYSTEM='11111111111111111111111111111111',RESTART='SysvarLastRestartS1ot1111111111111111111111',SYSVAR='Sysvar1111111111111111111111111111111111111';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const contexts=new WeakMap(),preparations=new WeakMap();
const fail=code=>{throw Error('PHOENIX_COLLATERAL_'+code);};
const meta=(address,role=0)=>({address,role});
const ix=(programAddress,accounts,data)=>({programAddress,accounts,data});
const immutable=i=>Object.freeze({programAddress:i.programAddress,accounts:Object.freeze(i.accounts.map(a=>Object.freeze({...a}))),data:Object.freeze([...i.data])});
function data(a,owner,max){
 if(!a||a.owner!==owner||a.executable!==false||!Number.isSafeInteger(a.lamports)||a.lamports<0||!Array.isArray(a.data)||a.data.length!==2||
    a.data[1]!=='base64'||typeof a.data[0]!=='string'||a.data[0].length>Math.ceil(max/3)*4)fail('ACCOUNT');
 const b=Buffer.from(a.data[0],'base64');if(b.length>max||b.toString('base64')!==a.data[0])fail('ACCOUNT');return b;
}
function bank(v,count,slot){if(!Number.isSafeInteger(v?.context?.slot)||v.context.slot<slot||!Array.isArray(v.value)||v.value.length!==count)fail('BANK');return v;}
export async function readPhoenixCollateralContext({walletAddress,minimumSlot=0,commitment='finalized'}={},
 {request,now=Date.now,monotonicNow=()=>performance.now()}={}){
 phoenixKey(walletAddress);
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function'||!Number.isSafeInteger(minimumSlot)||minimumSlot<0||!['confirmed','finalized'].includes(commitment))fail('INPUT');
 const started=monotonicNow(),a=await derivePhoenixWalletAccounts(walletAddress,1);
 if(!Number.isFinite(started)||await request('getGenesisHash',[])!==GENESIS)fail('NETWORK');
 const addresses=[GLOBAL,a.globalVault,ID.usdc,ID.canonicalUsdc,RESTART];
 const first=bank(await request('getMultipleAccounts',[addresses,{encoding:'base64',commitment,minContextSlot:minimumSlot,dataSlice:{offset:0,length:16384}}]),5,minimumSlot);
 const global=decodeGlobalConfiguration(data(first.value[0],ID.program,16384));
 if(global.accountKey!==GLOBAL||global.canonicalTokenMintKey!==ID.canonicalUsdc||global.globalVaultKey!==a.globalVault||global.quoteDecimals!==6)fail('GLOBAL');
 for(const address of [global.perpAssetMapKey,global.withdrawQueueKey,global.globalTraderIndexHeaderKey,global.activeTraderBufferHeaderKey])phoenixKey(address);
 const vault=data(first.value[1],TOKEN,165);
 if(vault.length!==165||bs58.encode(vault.subarray(0,32))!==ID.canonicalUsdc||bs58.encode(vault.subarray(32,64))!==a.globalVault||vault[108]!==1||vault.readUInt32LE(72)!==0||vault.readUInt32LE(109)!==0||vault.readUInt32LE(129)!==0)fail('VAULT');
 for(const raw of first.value.slice(2,4)){const b=data(raw,TOKEN,82);if(b.length!==82||b[44]!==6||b[45]!==1)fail('MINT');}
 const restart=data(first.value[4],SYSVAR,8);if(restart.length!==8)fail('RESTART');
 const headers=[global.globalTraderIndexHeaderKey,global.activeTraderBufferHeaderKey];
 const second=bank(await request('getMultipleAccounts',[headers,{encoding:'base64',commitment,minContextSlot:first.context.slot,dataSlice:{offset:0,length:96}}]),2,first.context.slot);
 const headerClient={addresses:{globalConfigurationAddress:GLOBAL,phoenixProgramAddress:ID.program},async fetchAccount(address){
  const i=headers.indexOf(address);if(i<0)fail('ARENA');const b=data(second.value[i],ID.program,96);
  if(b.length!==96||b.readUInt16LE(54)<1||b.readUInt16LE(54)>16||b.readUInt16LE(52)<b.readUInt16LE(54))fail('ARENA');return {data:b};
 }};
 const [index,buffer]=await Promise.all([getGlobalTraderIndexAddresses(headerClient,global),getActiveTraderBufferAddresses(headerClient,global)]);
 const keys={globalConfig:GLOBAL,canonicalMint:ID.canonicalUsdc,globalVault:a.globalVault,perpAssetMap:global.perpAssetMapKey,withdrawQueue:global.withdrawQueueKey,
  globalTraderIndex:Object.freeze([...index]),activeTraderBuffer:Object.freeze([...buffer])};
 if(new Set([...addresses,...index,...buffer,keys.perpAssetMap,keys.withdrawQueue]).size!==addresses.length+index.length+buffer.length+2)fail('KEYS');
 if(await request('getGenesisHash',[])!==GENESIS)fail('NETWORK');
 const result=Object.freeze({stage:'PHOENIX_NATIVE_COLLATERAL_CONTEXT',walletAddress,commitment,observedSlot:second.context.slot,observedAt:now(),
  runningState:getExchangeRunningState({globalConfiguration:global,lastRestartSlot:restart.readBigUInt64LE(0)}),
  exchangeKeys:Object.freeze(keys),exchangeKeyFingerprint:phoenixExchangeKeyFingerprint(keys),readyForSigning:false});
 contexts.set(result,{request,now,monotonicNow,started});requirePhoenixCollateralContext(result,{walletAddress,request});return result;
}
export function requirePhoenixCollateralContext(value,{walletAddress,request,minimumSlot=0}={}){
 const p=contexts.get(value);if(!p||value.walletAddress!==walletAddress||(request&&p.request!==request)||value.observedSlot<minimumSlot)fail('UNVERIFIED');
 const age=p.monotonicNow()-p.started;
 if(!Number.isFinite(age)||age<0||age>10000||!Number.isSafeInteger(p.now())||p.now()<value.observedAt||p.now()-value.observedAt>10000)fail('EXPIRED');return value;
}
function createAta(wallet,address,mint){return ix(ATA,[meta(wallet,3),meta(address,1),meta(wallet),meta(mint),meta(SYSTEM),meta(TOKEN)],new Uint8Array([1]));}
export async function preparePhoenixCollateral({context,account,subaccountIndex,phase='WITHDRAW',amountUnits}={}, {request}={}){
 if(typeof request!=='function')fail('INPUT');
 const wallet=account?.walletAddress;
 const current=()=>{requirePhoenixCollateralContext(context,{walletAddress:wallet,request});requireFreshPhoenixChainAccount(account,{walletAddress:wallet,request});};current();
 if(!['WITHDRAW','UNWRAP'].includes(phase))fail('PHASE');
 const parent=account.subaccounts.find(s=>s.subaccountIndex===0),child=account.subaccounts.find(s=>s.subaccountIndex===subaccountIndex);
 if(!parent?.exists||!child?.exists||!parent.authorityIsWallet||!child.authorityIsWallet||!parent.disableCollateralSweep||!child.disableCollateralSweep||
    child.positions.some(p=>p.baseLots!=='0'||p.virtualQuoteLots!=='0')||child.hasSplineLiquidity||child.spotCollateralCount||child.hasLockedDeposit||child.conditionalOrderCount)fail('ACCOUNT_POLICY');
 const a=await derivePhoenixWalletAccounts(wallet,subaccountIndex);current();
 if(child.address!==a.trader)fail('ACCOUNT_POLICY');
 if(child.withdrawalQueued)return Object.freeze({stage:'PHOENIX_COLLATERAL_QUEUED',phase:'WAIT',readyForSigning:false,requiresReconciliation:true,walletCredited:false,instructions:Object.freeze([])});
 let amount;const instructions=[];
 if(phase==='WITHDRAW'){
  amount=BigInt(child.quoteCollateralUnits);if(amount<=0n)fail('NO_COLLATERAL');
  if(account.canonical.exists&&!account.canonical.spendable)fail('TOKEN_POLICY');
  const k=context.exchangeKeys;
  instructions.push(createAta(wallet,a.canonicalAta,ID.canonicalUsdc),buildWithdrawFundsIx({programAddress:ID.program,logAuthorityAddress:LOG,globalConfigurationAddress:GLOBAL,
   trader:wallet,traderAccount:a.trader,mint:ID.canonicalUsdc,perpAssetMap:k.perpAssetMap,globalVault:k.globalVault,
   destinationTokenAccount:a.canonicalAta,withdrawQueue:k.withdrawQueue,globalTraderIndex:k.globalTraderIndex,activeTraderBuffer:k.activeTraderBuffer,amount}));
 }else{
  if(typeof amountUnits!=='string'||!/^[1-9]\d{0,19}$/.test(amountUnits)||(amount=BigInt(amountUnits))>18446744073709551615n||
     !account.canonical.spendable||amount>BigInt(account.canonical.amountUnits)||child.quoteCollateralUnits!=='0'||account.usdc.exists&&!account.usdc.spendable)fail('PAYOUT_NOT_AVAILABLE');
  const approve=Buffer.alloc(9);approve[0]=4;approve.writeBigUInt64LE(amount,1);
  instructions.push(ix(TOKEN,[meta(a.canonicalAta,1),meta(a.emberState),meta(wallet,2)],approve),createAta(wallet,a.usdcAta,ID.usdc),
   // Ember withdraw keeps the configured pair in USDC/canonical order; its
   // withdrawal opcode reverses the transfer, not the account ordering.
   ix(ID.ember,[meta(wallet,2),meta(a.emberState),meta(ID.usdc),meta(ID.canonicalUsdc,1),meta(a.usdcAta,1),meta(a.canonicalAta,1),meta(a.emberVault,1),meta(TOKEN)],getEmberWithdrawEncoder().encode(amount)),
   ix(TOKEN,[meta(a.canonicalAta,1),meta(wallet,2)],new Uint8Array([5])));
 }
 current();
 const result=Object.freeze({stage:'PHOENIX_COLLATERAL_UNSIGNED',walletAddress:wallet,phase,subaccountIndex,traderAddress:a.trader,amountUnits:amount.toString(),addresses:a,
  observedSlot:Math.max(context.observedSlot,account.observedSlot),instructions:Object.freeze(instructions.map(immutable)),readyForSigning:false,
  requiresSameWireSimulation:true,requiresDurableOwnerConsent:true,requiresFinalizedPayoutBinding:phase==='UNWRAP',walletCredited:false});
 preparations.set(result,{context,account,request,current});return result;
}
export function requirePhoenixCollateralPreparation(value){const p=preparations.get(value);if(!p)fail('UNVERIFIED');p.current();return Object.freeze({...p,preparation:value});}
