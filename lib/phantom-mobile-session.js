// Connection approval only. Session/key material stays in memory and is discarded.
import {createPhantomConnectRequest,buildPhantomConnectUrl,decryptPhantomConnectResponse} from './phantom-deeplink.js';
export function createPhantomMobileSession({app,launcher,now=Date.now,timeoutMs=180000}){
  if(!app?.addListener||!launcher?.openPhantom)throw Error('MOBILE_CONNECT_UNAVAILABLE');
  let pending=null,disposed=false;
  function finish(error,account){
    const p=pending;if(!p)return;pending=null;clearTimeout(p.timer);p.request.secretKey.fill(0);
    Promise.resolve(p.listener?.remove?.()).catch(()=>{});
    if(error)p.reject(error);else p.resolve(account);
  }
  return {
    async connect(){
      if(disposed||pending)throw Error('MOBILE_CONNECT_BUSY');
      const request=createPhantomConnectRequest();
      const result=new Promise((resolve,reject)=>{pending={request,resolve,reject,startedAt:now()};});
      // Cancellation may arrive while native listener registration is still pending.
      result.catch(()=>{});
      // Register before launching to avoid missing a fast callback.
      const p=pending;p.timer=setTimeout(()=>finish(Error('MOBILE_CONNECT_EXPIRED')),timeoutMs);
      try{
        const listener=await app.addListener('appUrlOpen',({url}={})=>{
          if(pending!==p||typeof url!=='string'||url.length>30000)return;
          let parsed;try{parsed=new URL(url);}catch{return;}
          if(parsed.protocol!=='jamddmaj:'||parsed.hostname!=='phantom'||parsed.searchParams.get('request')!==request.requestId)return;
          if(now()-p.startedAt>timeoutMs||now()<p.startedAt)return finish(Error('MOBILE_CONNECT_EXPIRED'));
          try{const reply=decryptPhantomConnectResponse(url,request);finish(null,Object.freeze({address:reply.publicKey,network:'Solana mainnet'}));}catch(error){finish(error);}
        });
        if(pending!==p){await listener.remove?.();return result;}
        p.listener=listener;
        await launcher.openPhantom({url:buildPhantomConnectUrl({publicKey:request.publicKey,requestId:request.requestId})});
      }catch(error){if(pending===p)finish(error);}
      return result;
    },
    disconnect(){finish(Error('MOBILE_CONNECT_CANCELLED'));},
    dispose(){disposed=true;finish(Error('MOBILE_CONNECT_CANCELLED'));}
  };
}
