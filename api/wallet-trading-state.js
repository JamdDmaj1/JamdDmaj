import bs58 from 'bs58';
import {corsHeaders,jsonResponse} from '../lib/server.js';
import {enforceQuoteLimit} from './swap-quote.js';
import {createServerPerpsReadOnlyRpc} from '../lib/perps-server-rpc.js';
import {readWalletTradingState} from '../lib/wallet-trading-reader.js';
import {validateWalletTradingSnapshot} from '../lib/wallet-trading-state.js';
export function createHandler({read=readWalletTradingState,limit=enforceQuoteLimit,request=createServerPerpsReadOnlyRpc(),now=Date.now,diagnostic=()=>console.warn('wallet_trading_state_unavailable')}={}){
 return async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(req)});
  if(req.method!=='GET')return jsonResponse(req,{error:'METHOD_NOT_ALLOWED'},405);
  const query=new URL(req.url).searchParams,address=query.get('address');
  try{if([...query.keys()].join(',')!=='address'||typeof address!=='string'||bs58.decode(address).length!==32||bs58.encode(bs58.decode(address))!==address)throw Error();}
  catch{return jsonResponse(req,{error:'INVALID_WALLET'},400);}
  try{await limit(req);const snapshot=validateWalletTradingSnapshot(await read(address,{request,now}),{address},now());
   return jsonResponse(req,snapshot,200,{'Cache-Control':'private, no-store'});
  }catch(e){diagnostic();return jsonResponse(req,{error:e?.status===429?'RATE_LIMITED':'WALLET_STATE_UNAVAILABLE'},e?.status===429?429:502,{'Cache-Control':'private, no-store'});}
 };
}
export default {fetch:createHandler()};
