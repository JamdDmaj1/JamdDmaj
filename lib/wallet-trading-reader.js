// Bounded public-chain display only. No journal, vault, builder or send method.
import bs58 from 'bs58';
import {readServerPerpsAccount} from './perps-server-account.js';
import {PERPS_PROGRAM} from './perps-server-custody.js';
import {decodeRecordedServerPerpsExit} from './perps-server-exits.js';
export async function readWalletTradingState(walletAddress,{request,now=Date.now,readAccount=readServerPerpsAccount}={}){
 const account=await readAccount({walletAddress},{request,now});
 let orders=[],ordersComplete=false,history=[],historyComplete=false;
 try{
  const reply=await request('getProgramAccounts',[PERPS_PROGRAM,{encoding:'base64',commitment:'confirmed',withContext:true,minContextSlot:account.observedSlot,
   filters:[{memcmp:{offset:0,bytes:bs58.encode(Buffer.from('0c26fac72e9a20d8','hex'))}},{memcmp:{offset:8,bytes:walletAddress}}]}]);
  if(!Number.isSafeInteger(reply?.context?.slot)||reply.context.slot<account.observedSlot||!Array.isArray(reply.value)||reply.value.length>100)throw Error();
  orders=await Promise.all(reply.value.map(async row=>{
   const data=Buffer.from(row.account?.data?.[0]||'','base64');
   if(row.account?.owner!==PERPS_PROGRAM||row.account?.executable!==false||data.length<230||data.length>4096
    ||row.account.data[1]!=='base64'||data.toString('base64')!==row.account.data[0]||bs58.encode(data.subarray(8,40))!==walletAddress
    ||data.subarray(0,8).toString('hex')!=='0c26fac72e9a20d8'||bs58.decode(row.pubkey).length!==32)throw Error();
   const p=account.positions.find(p=>p.address===bs58.encode(data.subarray(104,136)));
   if(!p)return {address:row.pubkey,kind:'UNCLASSIFIED'};
   const profit=(data[216]===1)===(p.side==='LONG'),kind=profit?'TP':'SL';
   try{await decodeRecordedServerPerpsExit({address:row.pubkey,kind,sizeUsdUnits:data.readBigUInt64LE(184).toString(),triggerPriceUsdUnits:data.readBigUInt64LE(207).toString(),counter:data.readBigUInt64LE(220).toString()},row.account,{walletAddress,asset:p.asset,side:p.side});
    return {address:row.pubkey,kind};
   }catch{return {address:row.pubkey,kind:'UNCLASSIFIED'};}
  }));ordersComplete=true;
 }catch{orders=[];}
 try{
  const rows=await request('getSignaturesForAddress',[walletAddress,{limit:50,commitment:'confirmed',minContextSlot:account.observedSlot}]);
  if(!Array.isArray(rows)||rows.length>50)throw Error();
  history=rows.map(h=>({signature:h.signature,slot:h.slot,blockTime:h.blockTime,failed:h.err!==null,confirmation:h.confirmationStatus}));
  // This endpoint deliberately returns a recent page, never claims full history.
  historyComplete=rows.length<50;
 }catch{history=[];}
 return {stage:'PUBLIC_WALLET_TRADING_STATE',walletAddress,network:'solana-mainnet',readOnly:true,observedAt:account.observedAt,observedSlot:account.observedSlot,
  availableUsdcUnits:account.availableUsdcUnits,allocatedUsdUnits:account.allocatedUsdcUnits,payerLamports:account.payerLamports,
  positions:account.positions.map(({address,asset,side,sizeUsdUnits,collateralUsdUnits,priceUsdUnits})=>({address,asset,side,sizeUsdUnits,collateralUsdUnits,priceUsdUnits})),
  orders,ordersComplete,history,historyComplete};
}
