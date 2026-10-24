import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {publishWalletTradingState} from './wallet-trading-state.js';
import {registerPlugin} from '@capacitor/core';
import {openWebPerpsSigningJournal} from './perps-web-signing-journal.js';
import {openWebCloseJournal} from './perps-web-wallet-session.js';
// One controller for all views, never connects a provider or reconciles a send.
export function setupWalletTradingController(doc,win,{readPending,request=win.fetch?.bind(win),nativePlugin=()=>registerPlugin('NativeWallet')}={}){
 let disposed=false,active=null,revision=0,controller=null,busy=false;
 async function refresh(force=false){
  const account=selectedWalletAccount(doc);if(!account||disposed||typeof request!=='function')return;
  if(busy&&!force&&active===account)return;
  active=account;const ticket=++revision;controller?.abort();controller=new AbortController();busy=true;
  if(force)publishWalletTradingState(doc,null,account);
  const abort=controller,signal=abort.signal,timer=setTimeout(()=>abort.abort(),18000);
  const current=()=>!disposed&&ticket===revision&&selectedWalletAccount(doc)===account;
  try{
   let holds={pendingKnown:false,pending:[]};
   try{
    if(readPending)holds=await readPending(account);
    else if(account.source==='native'){
     const observed=await nativePlugin().getPublicAccount();
     if(observed?.address!==account.address||observed.available!==true)throw Error();
     holds={pendingKnown:observed.pendingKnown===true,pending:observed.pending||[]};
    }
    else{const journal=await openWebPerpsSigningJournal({indexedDB:win.indexedDB});let closes;try{closes=await openWebCloseJournal({indexedDB:win.indexedDB});holds={pendingKnown:true,pending:[...(await journal.pending(account.address)).map(p=>({id:p.operationId,state:p.state})),...(await closes.pending(account.address)).map(p=>({id:p.id,state:'CLOSE_'+p.state}))]};}finally{journal.close();closes?.close();}}
   }catch{/* Storage failure is unknown reservations, never a zero balance. */}
   if(!current())return;
   const base=win.Capacitor?.isNativePlatform?.()?'https://www.jamddmaj.com':'';
   const response=await request(base+'/api/wallet-trading-state?address='+encodeURIComponent(account.address),{cache:'no-store',credentials:'omit',redirect:'error',signal});
   if(!response.ok||response.redirected)throw Error();
   const data=await response.json();if(current())publishWalletTradingState(doc,data,account,holds);
  }catch{if(current())publishWalletTradingState(doc,null,account);}
  finally{clearTimeout(timer);if(ticket===revision)busy=false;}
 }
 const changed=()=>{const account=selectedWalletAccount(doc);if(account!==active){revision++;controller?.abort();busy=false;active=account;}if(account)refresh();};
 const requested=()=>refresh(true),visible=()=>{if(!doc.hidden)refresh();};
 doc.addEventListener?.('jamd-wallet-portfolio',changed);doc.addEventListener?.('jamd-wallet-refresh',requested);
 const resumed=()=>{if(!doc.hidden)refresh(true);};
 doc.addEventListener?.('visibilitychange',resumed);win.addEventListener?.('focus',resumed);
 win.addEventListener?.('jamd-wallet-operations',requested);
 let channel;try{if(typeof win.BroadcastChannel==='function'){channel=new win.BroadcastChannel('jamddmaj-wallet-display');channel.onmessage=requested;}}catch{}
 const interval=setInterval(visible,20000);interval?.unref?.();changed();
 return()=>{disposed=true;revision++;controller?.abort();channel?.close();clearInterval(interval);doc.removeEventListener?.('jamd-wallet-portfolio',changed);doc.removeEventListener?.('jamd-wallet-refresh',requested);doc.removeEventListener?.('visibilitychange',resumed);win.removeEventListener?.('focus',resumed);win.removeEventListener?.('jamd-wallet-operations',requested);};
}
