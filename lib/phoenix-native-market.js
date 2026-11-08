// Bind API market identity/risk and exchange accounts to actual mainnet state.
// This reader cannot send, sign, onboard, fund or authorize a transaction.
import bs58 from 'bs58';
import {createHash} from 'node:crypto';
import {getProgramDerivedAddress} from '@solana/kit';
import {decodeGlobalConfiguration,decodeOrderbookHeader,decodePerpAssetMap,
 getGlobalTraderIndexAddresses,getActiveTraderBufferAddresses,getExchangeRunningState} from '@ellipsis-labs/rise';
import {PHOENIX_IDENTITIES as ID,phoenixKey,requirePhoenixUnsignedPlan} from './phoenix-market-plan.js';
import {derivePhoenixWalletAccounts,phoenixExchangeKeyFingerprint} from './phoenix-instruction-bindings.js';

const GLOBAL='2zskx2iyCvb6Stg7RBZkt1f6MrF4dpYtMG3yMvKwqtUZ';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SYSVAR='Sysvar1111111111111111111111111111111111111';
const RESTART='SysvarLastRestartS1ot1111111111111111111111';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const proofs=new WeakMap();
const fail=code=>{throw Error('PHOENIX_NATIVE_'+code);};
function data(account,owner,max){
 if(!account||account.owner!==owner||account.executable!==false||
    !Array.isArray(account.data)||account.data.length!==2||account.data[1]!=='base64'||
    typeof account.data[0]!=='string'||account.data[0].length>Math.ceil(max/3)*4||
    !Number.isSafeInteger(account.lamports)||account.lamports<0)fail('ACCOUNT');
 const b=Buffer.from(account.data[0],'base64');if(b.length>max||b.toString('base64')!==account.data[0])fail('ACCOUNT');return b;
}
function bank(reply,count,minimumSlot){
 if(!Number.isSafeInteger(reply?.context?.slot)||reply.context.slot<minimumSlot||
    !Array.isArray(reply.value)||reply.value.length!==count)fail('BANK');
 return reply;
}
function boundedArenaHeader(b){
 if(b.length<96||b.readUInt16LE(54)<1||b.readUInt16LE(54)>16||b.readUInt16LE(52)<b.readUInt16LE(54))fail('ARENA');
}

export async function readPhoenixNativeMarket(plan,{exchangeKeys,request,now=Date.now,
 monotonicNow=()=>performance.now(),commitment='confirmed'}={}){
 requirePhoenixUnsignedPlan(plan);
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function'||
    !['confirmed','finalized'].includes(commitment)||now()>=plan.expiresAt)fail('INPUT');
 const keys=structuredClone(exchangeKeys),started=monotonicNow();
 if(!Number.isFinite(started)||!keys||keys.globalConfig!==GLOBAL||keys.canonicalMint!==ID.canonicalUsdc)fail('KEYS');
 for(const key of ['globalVault','perpAssetMap','withdrawQueue'])phoenixKey(keys[key]);
 for(const group of [keys.globalTraderIndex,keys.activeTraderBuffer]){
  if(!Array.isArray(group)||group.length<1||group.length>16||new Set(group).size!==group.length)fail('KEYS');group.forEach(phoenixKey);
 }
 const derived=await derivePhoenixWalletAccounts(plan.walletAddress,plan.isolatedSubaccountIndex);
 const [spline]=await getProgramDerivedAddress({programAddress:ID.program,seeds:['spline',bs58.decode(plan.market.market)]});
 if(derived.globalVault!==keys.globalVault||spline!==plan.market.spline)fail('KEYS');
 if(await request('getGenesisHash',[])!==GENESIS)fail('NETWORK');
 const addresses=[GLOBAL,plan.market.market,plan.market.spline,keys.globalVault,ID.usdc,ID.canonicalUsdc,RESTART,
  ...keys.globalTraderIndex,...keys.activeTraderBuffer];
 if(new Set(addresses).size!==addresses.length)fail('KEYS');
 const reply=bank(await request('getMultipleAccounts',[addresses,{encoding:'base64',commitment,
  minContextSlot:plan.observedSlot,dataSlice:{offset:0,length:16384}}]),addresses.length,plan.observedSlot);
 const decoded=new Map(addresses.map((a,i)=>[a,reply.value[i]]));
 let global,book;
 try{
  global=decodeGlobalConfiguration(data(decoded.get(GLOBAL),ID.program,16384));
  const bookData=data(decoded.get(plan.market.market),ID.program,16384);
  if(bookData.length<5504||bookData.readUInt32LE(376)>63||bookData.readUInt32LE(380)>64)fail('BOOK');
  book=decodeOrderbookHeader(bookData);
 }catch(error){if(error.message.startsWith('PHOENIX_NATIVE_'))throw error;fail('LAYOUT');}
 const splineData=data(decoded.get(plan.market.spline),ID.program,16384);
 if(splineData.length<8||!splineData.subarray(0,8).equals(createHash('sha256').update('account:spline_collection').digest().subarray(0,8)))fail('SPLINE');
 if(global.accountKey!==GLOBAL||global.canonicalTokenMintKey!==ID.canonicalUsdc||global.globalVaultKey!==keys.globalVault||
    global.perpAssetMapKey!==keys.perpAssetMap||global.withdrawQueueKey!==keys.withdrawQueue||global.quoteDecimals!==6||
    global.globalTraderIndexHeaderKey!==keys.globalTraderIndex[0]||global.activeTraderBufferHeaderKey!==keys.activeTraderBuffer[0])fail('KEYS');
 const restart=data(decoded.get(RESTART),SYSVAR,8);if(restart.length!==8)fail('RESTART');
 const runningState=getExchangeRunningState({globalConfiguration:global,lastRestartSlot:restart.readBigUInt64LE(0)});
 if(runningState!=='active')fail('EXCHANGE_'+runningState.toUpperCase());
 if(book.assetId!==plan.market.assetId||book.assetSymbol!==plan.symbol||book.baseLotsDecimals!==plan.market.baseLotsDecimals||
    book.tickSizeInQuoteLotsPerBaseLot.toString()!==plan.market.tickSize||book.defaultTakerFeeMicro!==plan.market.feeMicro)fail('METADATA_CHANGED');
 if(book.marketStatus!==1)fail('MARKET_STATUS');
 const vault=data(decoded.get(keys.globalVault),TOKEN,165);
 if(vault.length!==165||bs58.encode(vault.subarray(0,32))!==ID.canonicalUsdc||bs58.encode(vault.subarray(32,64))!==keys.globalVault||
    vault[108]!==1||vault.readUInt32LE(72)!==0||vault.readUInt32LE(109)!==0||vault.readUInt32LE(129)!==0)fail('VAULT');
 for(const mint of [ID.usdc,ID.canonicalUsdc]){
  const b=data(decoded.get(mint),TOKEN,82);if(b.length!==82||b[44]!==6||b[45]!==1)fail('MINT');
 }
 const headerClient={addresses:{globalConfigurationAddress:GLOBAL,phoenixProgramAddress:ID.program},
  async fetchAccount(address){
   if(![keys.globalTraderIndex[0],keys.activeTraderBuffer[0]].includes(address))fail('ARENA');
   const b=data(decoded.get(address),ID.program,16384);boundedArenaHeader(b);return {data:b};
  }};
 let index,buffer;
 try{[index,buffer]=await Promise.all([getGlobalTraderIndexAddresses(headerClient,global),getActiveTraderBufferAddresses(headerClient,global)]);}
 catch(error){if(error.message.startsWith('PHOENIX_NATIVE_'))throw error;fail('ARENA');}
 if(JSON.stringify(index)!==JSON.stringify(keys.globalTraderIndex)||JSON.stringify(buffer)!==JSON.stringify(keys.activeTraderBuffer))fail('ARENA');
 for(const address of [...index,...buffer])data(decoded.get(address),ID.program,16384);
 const assetReply=bank(await request('getMultipleAccounts',[[keys.perpAssetMap],{encoding:'base64',commitment,
  minContextSlot:reply.context.slot}]),1,reply.context.slot);
 const assetBytes=data(assetReply.value[0],ID.program,2097152);
 if(assetBytes.length<48||assetBytes.readUInt32LE(32)>1024||assetBytes.readBigUInt64LE(40)>1024n)fail('ASSET_MAP');
 let metadata;
 try{metadata=decodePerpAssetMap(assetBytes).metadata.entries.find(e=>e.key===plan.symbol)?.value;}
 catch{fail('ASSET_MAP');}
 if(!metadata||metadata.staticMarketParams.assetId!==plan.market.assetId||metadata.staticMarketParams.marketAccount!==plan.market.market||
    metadata.staticMarketParams.tickSize.toString()!==plan.market.tickSize||metadata.staticMarketParams.baseLotDecimals!==plan.market.baseLotsDecimals)fail('ASSET_MAP');
 if(!plan.close&&!metadata.riskParams.leverageTiers.some(t=>t.upperBoundSize>=BigInt(plan.baseLots)&&t.maxLeverage*10n>=BigInt(plan.leverageTenths)))fail('RISK_TIER');
 if(await request('getGenesisHash',[])!==GENESIS)fail('NETWORK');
 const observedAt=now(),elapsed=monotonicNow()-started;
 if(!Number.isSafeInteger(observedAt)||!Number.isFinite(elapsed)||elapsed<0||elapsed>10000||observedAt>=plan.expiresAt)fail('EXPIRED');
 const result=Object.freeze({stage:'PHOENIX_NATIVE_MARKET',readyForSigning:false,walletAddress:plan.walletAddress,
  symbol:plan.symbol,assetId:plan.market.assetId,marketAddress:plan.market.market,commitment,
  observedAt,observedSlot:assetReply.context.slot,runningState,depositCooldownSlots:global.depositCooldownPeriodInSlots.toString(),
  takerFeeMicro:book.defaultTakerFeeMicro,exchangeKeyFingerprint:phoenixExchangeKeyFingerprint(keys),
  exchangeKeys:Object.freeze({globalConfig:GLOBAL,canonicalMint:ID.canonicalUsdc,globalVault:keys.globalVault,
   perpAssetMap:keys.perpAssetMap,withdrawQueue:keys.withdrawQueue,globalTraderIndex:Object.freeze([...index]),activeTraderBuffer:Object.freeze([...buffer])}),
  requiresSameWireSimulation:true});
 proofs.set(result,{plan,request,now,monotonicNow,started});return result;
}

export function requireFreshPhoenixNativeMarket(value,{plan,request,minimumSlot=0}={}){
 const p=proofs.get(value);if(!p||p.plan!==plan||(request&&p.request!==request)||value.observedSlot<minimumSlot)fail('UNVERIFIED');
 const age=p.monotonicNow()-p.started;
 if(!Number.isFinite(age)||age<0||age>10000||p.now()<value.observedAt||p.now()>=plan.expiresAt||p.now()-value.observedAt>10000)fail('EXPIRED');
 return value;
}
