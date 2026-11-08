import {buildPlaceMarketOrderIx,buildDepositFundsIx,buildEmberDepositIx} from '@ellipsis-labs/rise';
import {decodePhoenixCatalog,PHOENIX_IDENTITIES as ID} from '../../lib/phoenix-market-plan.js';
import {decodePhoenixMarketQuote} from '../../lib/phoenix-market-quote.js';
import {readPhoenixChainAccount} from '../../lib/phoenix-chain-account.js';
import {phoenixChainAccountFixture,phoenixTestKey} from './phoenix-chain-account-fixture.mjs';

export async function phoenixOrderFixture(options={}){
 const f=await phoenixChainAccountFixture(options),key=phoenixTestKey;
 const row={symbol:'DOGE',assetId:7,marketStatus:'active',metadata:{assetClass:'crypto'},marketPubkey:key(20),splinePubkey:key(21),tickSize:1,baseLotsDecimals:0,takerFee:0.00035,leverageTiers:[{maxLeverage:10,maxSizeBaseLots:1000000}]};
 const catalog=decodePhoenixCatalog([row],{observedAt:f.now()}),quote=decodePhoenixMarketQuote({symbol:'DOGE',timestamp_ms:f.now(),mark_price:0.12345678,oracle_price:0.1235},{symbol:'DOGE',now:f.now()});
 const exchangeKeys={globalConfig:'2zskx2iyCvb6Stg7RBZkt1f6MrF4dpYtMG3yMvKwqtUZ',canonicalMint:ID.canonicalUsdc,globalVault:f.a.globalVault,perpAssetMap:key(31),globalTraderIndex:[key(32)],activeTraderBuffer:[key(33)],withdrawQueue:key(34)};
 const common={trader:f.wallet,traderAccount:f.a.trader,perpAssetMap:exchangeKeys.perpAssetMap,globalTraderIndex:exchangeKeys.globalTraderIndex,activeTraderBuffer:exchangeKeys.activeTraderBuffer};
 const meta=(address,role=0)=>({address,role});
 let deposits=0;
 const client={ixs:{
  async buildPlaceMarketOrder({authority,traderPdaIndex,traderSubaccountIndex,symbol,orderPacket}){
   if(authority!==f.wallet||traderPdaIndex!==0||traderSubaccountIndex!==1||symbol!=='DOGE')throw Error('BAD_TEST_ORDER_INPUT');
   return buildPlaceMarketOrderIx({...common,orderbook:row.marketPubkey,splineCollection:row.splinePubkey,orderPacket});
  },
  async buildDepositIxs({authority,amount}){
   if(authority!==f.wallet)throw Error('BAD_TEST_DEPOSIT_INPUT');deposits++;
   const createPhoenixAta={programAddress:'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',accounts:[meta(f.wallet,3),meta(f.a.canonicalAta,1),meta(f.wallet),meta(ID.canonicalUsdc),meta('11111111111111111111111111111111'),meta('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')],data:new Uint8Array([1])};
   const emberDeposit=buildEmberDepositIx({owner:f.wallet,inputMint:ID.usdc,outputMint:ID.canonicalUsdc,inputTokenAccount:f.a.usdcAta,outputTokenAccount:f.a.canonicalAta,emberState:f.a.emberState,emberVault:f.a.emberVault,amount});
   const depositFunds=buildDepositFundsIx({...common,mint:ID.canonicalUsdc,traderTokenAccount:f.a.canonicalAta,globalVault:f.a.globalVault,amount});
   return {instructions:[createPhoenixAta,emberDeposit,depositFunds],named:{createPhoenixAta,emberDeposit,depositFunds}};
  }
 }};
 const deps={publicClient:{catalog:async()=>catalog,quote:async()=>quote},readSlot:async()=>1000,
  readAccount:args=>readPhoenixChainAccount(args,{request:f.request,now:f.now,monotonicNow:f.monotonicNow}),now:f.now};
 const intent={walletAddress:f.wallet,symbol:'DOGE',side:'LONG',marginUsdcUnits:'10000000',leverageTenths:30,clientOrderId:'1',isolatedSubaccountIndex:1};
 const wireOptions={client,exchangeKeys,blockhash:key(50),lastValidBlockHeight:2000,now:f.now};
 return {...f,row,catalog,quote,exchangeKeys,client,deps,intent,wireOptions,get deposits(){return deposits;}};
}
