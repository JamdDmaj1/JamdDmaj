import {getWalletRegistry} from './lib/wallet-standard-registry.js';
import {getCompatibleSolanaWallets,getSolanaAccount,sanitizeWalletName} from './lib/wallet-security.js';
import {createEvmReadOnlySession} from './lib/external-wallet-session.js';
import {setupNativeWalletEntry,setupMainWalletEntry} from './native-wallet-entry.js';
import {createPhantomMobileSession} from './lib/phantom-mobile-session.js';
import {selectWalletAccount,selectedWalletAccount,publishWalletPortfolio,forgetWalletAccount} from './lib/wallet-portfolio-store.js';
import {setupWalletOverview} from './lib/wallet-overview.js';
import {setupWalletTradingController} from './lib/wallet-trading-controller.js';
import {setupWalletTradingPanel} from './lib/wallet-trading-panel.js';
import {setupAccountWalletPanel} from './lib/account-wallet-panel.js';
import {bindWebPerpsWalletSession,clearWebPerpsWalletSession} from './lib/perps-web-wallet-session.js';

export function setupAssetsWallets(language, doc=document, win=window) {
  const host=doc.getElementById('terminal-assets');if(!host)return;
  const disposeTrading=setupWalletTradingController(doc,win),disposeTradingPanel=setupWalletTradingPanel(host,language,doc);
  const t=(es,en)=>language==='es'?es:en;
  const panel=doc.createElement('section');panel.className='card';panel.id='external-wallet-assets';
  const el=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;panel.append(n);return n;};
  el('h2',t('Tu billetera externa','Your external wallet'));
  el('p',t('Conecta para consultar tu cuenta pública. Las claves permanecen en tu billetera. Esta conexión no inicia sesión, no firma ni mueve dinero. Es independiente de Bitget.','Connect to inspect your public account. Keys stay in your wallet. This connection does not sign you in, sign messages or move funds. It is separate from Bitget.'));
  const label=el('label',t('Billetera detectada','Detected wallet'));label.htmlFor='assets-wallet-choice';
  const select=el('select');select.id='assets-wallet-choice';
  el('p',t('Conectar Phantom no requiere iniciar sesión con Google. Google identifica tu cuenta JamdDmaj; Phantom autoriza su propia billetera. En incógnito debes permitir la extensión en ventanas privadas; iniciar sesión no instala ni habilita la extensión.','Connecting Phantom does not require Google sign-in. Google identifies your JamdDmaj account; Phantom authorizes its own wallet. In incognito, allow the extension in private windows; signing in does not install or enable it.'));
  const connect=el('button',t('Conectar billetera','Connect wallet'));connect.type='button';connect.id='assets-connect-wallet';
  const refresh=el('button',t('Consultar saldo nativo','Check native balance'));refresh.type='button';refresh.hidden=true;
  const disconnect=el('button',t('Desconectar de esta vista','Disconnect from this view'));disconnect.type='button';disconnect.hidden=true;
  const identity=el('p');identity.style.overflowWrap='anywhere';
  const balance=el('p');balance.className='wallet-native-balance';const holdings=el('div');holdings.className='wallet-holdings';const status=el('p');status.setAttribute('role','status');
  const note=el('p',t('Consulta SOL, ETH o BNB; no es un inventario de todos tus tokens. Desconectar aquí no revoca los permisos guardados en tu billetera.','Shows SOL, ETH or BNB; not a complete token inventory. Disconnecting here does not revoke permissions saved in your wallet.'));
  note.textContent=t('Solana: saldo SOL y tokens detectados. Los precios son estimaciones, no importes garantizados de venta. Ethereum y BNB: saldo nativo.','Solana: SOL balance and detected tokens. Prices are estimates, not guaranteed sale proceeds. Ethereum and BNB: native balance.');
  note.className='notes';host.prepend(panel);
  const disposeNative=win.Capacitor?.isPluginAvailable?.('DevnetWallet')?setupNativeWalletEntry(language,doc,win):()=>{};
  const disposeMain=setupMainWalletEntry(language,doc,win);
  const disposeOverview=setupWalletOverview(language,doc,win);
  const disposeAccountLink=setupAccountWalletPanel(language,doc,win);
  const registry=getWalletRegistry(),providers=new Map();let choices=[],session=null,removeChange=null,epoch=0,busy=false,active=null,refreshTimer;
  function publishPortfolio(data){publishWalletPortfolio(doc,data,{address:active?.address,source:'external'});}
  function clear(){clearWebPerpsWalletSession(doc);publishPortfolio(null);epoch++;clearInterval(refreshTimer);active=null;const old=session;session=null;old?.disconnect();removeChange?.();removeChange=null;identity.textContent='';balance.textContent='';holdings.replaceChildren();refresh.hidden=disconnect.hidden=true;select.disabled=false;connect.hidden=false;}
  function forgetExternal(){if(active?.address)forgetWalletAccount(doc,{address:active.address,source:'external'});try{win.localStorage?.removeItem('jamd.externalPublicWallet.v1');}catch{}}
  function invalid(){forgetExternal();clear();status.textContent=t('La cuenta o red cambió. Vuelve a conectar.','Account or network changed. Connect again.');}
  function discover(){
    if(active||busy)return;
    const previous=select.value;
    choices=getCompatibleSolanaWallets([...registry.get()]).map(({wallet,name})=>({kind:'solana',wallet,name}));
    for(const [provider,name] of providers)choices.push({kind:'evm',provider,name});
    if(win.Capacitor?.getPlatform?.()==='android')choices.push({kind:'mobile-entry',name:'Phantom'});
    select.replaceChildren();
    choices.forEach((choice,i)=>{const option=doc.createElement('option');option.value=String(i);option.textContent=choice.name+' · '+(choice.kind==='mobile-entry'?t('Conexión móvil','Mobile connection'):choice.kind==='solana'?'Solana':'Ethereum / BNB');select.append(option)});
    if(choices[Number(previous)])select.value=previous;
    connect.disabled=!choices.length;
    if(!choices.length)status.textContent=t('No se detectó una extensión compatible. Si estás en incógnito, permite Phantom en ventanas privadas desde la configuración de extensiones o usa una ventana normal con Phantom instalado. Google no resuelve esta detección. En Android utiliza la conexión móvil.','No compatible extension detected. In incognito, allow Phantom in private windows in extension settings, or use a normal window with Phantom installed. Google sign-in does not resolve detection. On Android use the mobile connection.');
    else status.textContent=t('Selecciona la billetera que reconoces. Los nombres son informados por las extensiones.','Select a wallet you recognize. Names are supplied by browser extensions.');
  }
  function announced(event){try{const p=event.detail?.provider;if(typeof p?.request==='function'&&typeof p?.on==='function'&&typeof p?.removeListener==='function'&&providers.size<20){providers.set(p,sanitizeWalletName(event.detail.info?.name));discover();}}catch{}}
  win.addEventListener('eip6963:announceProvider',announced);
  const unregister=registry.on('register',discover),unregisterGone=registry.on('unregister',(...removed)=>{if(removed.includes(active?.wallet))invalid();discover()});
  try{if(win.ethereum)announced({detail:{provider:win.ethereum,info:{name:t('Billetera EVM del navegador','Browser EVM wallet')}}});}catch{}
  win.dispatchEvent(new Event('eip6963:requestProvider'));discover();
  connect.onclick=async()=>{
    if(busy)return;const choice=choices[Number(select.value)];if(!choice)return;
    forgetExternal();clear();busy=true;connect.disabled=true;select.disabled=true;const ticket=epoch;
    status.textContent=t('Confirma la conexión en tu billetera.','Approve the connection in your wallet.');
    try{
      let account,standardAccount=null;
      if(choice.kind==='mobile-entry'){
        session=createPhantomMobileSession({app:win.Capacitor?.Plugins?.App,launcher:win.Capacitor?.Plugins?.ExternalWallet});
        account=await session.connect();
      }else if(choice.kind==='evm'){
        session=createEvmReadOnlySession(choice.provider,value=>{if(!value&&active)invalid()});
        const result=await session.connect();account={address:result.address,network:result.name};
      }else{
        const result=await choice.wallet.features['standard:connect'].connect();
        const selected=getSolanaAccount(result.accounts?.filter(value=>value?.chains?.includes('solana:mainnet')));
        if(!selected?.chains.includes('solana:mainnet'))throw new Error('unsupported-network');
        account={address:selected.address,network:'Solana mainnet'};
        standardAccount=selected;
        if(typeof choice.wallet.features['standard:events']?.on!=='function')throw new Error('unsupported-wallet');
        removeChange=choice.wallet.features['standard:events'].on('change',invalid);
      }
      if(ticket!==epoch)return;
      active={...choice,...account};identity.textContent=choice.name+' · '+account.network+' · '+account.address;
      if(choice.kind!=='evm')selectWalletAccount(doc,{address:account.address,source:'external',name:choice.name});
      else selectWalletAccount(doc,null); // EVM funds are not Solana collateral.
      if(standardAccount)bindWebPerpsWalletSession(doc,choice.wallet,standardAccount);
      if(choice.kind!=='evm')try{win.localStorage?.setItem('jamd.externalPublicWallet.v1',JSON.stringify({address:account.address,name:choice.name,network:'solana:mainnet'}));}catch{}
      refresh.hidden=disconnect.hidden=false;connect.hidden=true;
      status.textContent=t('Conectada para consulta. No se ha enviado dinero.','Connected for inspection. No funds were sent.');
    }catch(error){if(ticket===epoch){clear();status.textContent=error?.message==='phantom-not-installed'?t('Instala o actualiza la app oficial de Phantom y vuelve a conectar.','Install or update the official Phantom app and reconnect.'):t('Conexión cancelada, caducada o billetera no disponible. Vuelve a conectar y aprueba en Phantom.','Connection cancelled, expired or wallet unavailable. Reconnect and approve in Phantom.');}}
    finally{busy=false;connect.disabled=false;select.disabled=!!active;}
    if(active){
      await refresh.onclick();
      if(active&&ticket===epoch){refreshTimer=setInterval(()=>{if(!doc.hidden)refresh.onclick();},60000);refreshTimer?.unref?.();}
    }
  };
  refresh.onclick=async()=>{
    if(!active||busy)return;publishPortfolio(null);busy=true;refresh.disabled=true;const ticket=epoch,snapshot=active;balance.textContent='';holdings.replaceChildren();
    status.textContent=t('Consultando saldo…','Checking balance…');
    try{
      let amount,symbol;
      if(snapshot.kind==='evm'){const result=await session.balance();amount=result.amount;symbol=result.symbol;}
      else{
        const base=win.Capacitor?.isNativePlatform?.()?'https://www.jamddmaj.com':'';
        const response=await fetch(base+'/api/solana-portfolio?address='+encodeURIComponent(snapshot.address),{cache:'no-store',signal:AbortSignal.timeout(15000)});
        const data=await response.json();
        const timestamp=Date.parse(data.updatedAt),age=Date.now()-timestamp;
        if(!response.ok||!data.ok||data.address!==snapshot.address||data.network!=='solana:mainnet'||!Number.isFinite(data.sol?.amount)||data.sol.amount<0||!Number.isFinite(age)||age< -5000||age>120000)throw new Error('invalid-balance');
        if(ticket!==epoch)return;
        publishPortfolio(data);
        amount=String(data.sol.amount);symbol='SOL';
        for(const token of (Array.isArray(data.tokens)?data.tokens:[]).slice(0,100)){
          if(!Number.isFinite(token.amount)||token.amount<=0||typeof token.mint!=='string')continue;
          const row=doc.createElement('div');row.className='wallet-token-row';
          const name=doc.createElement('strong');name.textContent=String(token.symbol||token.mint).slice(0,44);
          const quantity=doc.createElement('span');quantity.textContent=token.amount.toLocaleString(language,{maximumSignificantDigits:12});
          const mint=doc.createElement('small');mint.textContent=token.mint;mint.style.overflowWrap='anywhere';
          row.append(name,quantity,mint);holdings.append(row);
        }
        const coverage=doc.createElement('p');coverage.textContent=data.partial?t('Lista parcial: algunas consultas no respondieron.','Partial list: some queries failed.'):t('Tokens detectados en esta consulta; verifica su dirección antes de operar.','Tokens detected in this query; verify their address before trading.');holdings.append(coverage);
      }
      if(ticket!==epoch)return;balance.textContent=amount+' '+symbol;status.textContent=t('Consultado a las ','Checked at ')+new Date().toLocaleTimeString(language);
    }catch{if(ticket===epoch){balance.textContent='';holdings.replaceChildren();status.textContent=t('No pudimos actualizar el saldo. Reintenta; si persiste, comprueba la fecha y hora del dispositivo. No se sustituye por cero.','Could not refresh balance. Retry; if it persists, check device date and time. It is not replaced with zero.');}}
    finally{busy=false;refresh.disabled=false;}
  };
  const refreshSelected=()=>{const selected=selectedWalletAccount(doc);if(selected?.source==='external'&&selected.address===active?.address)refresh.onclick();};
  doc.addEventListener?.('jamd-wallet-refresh',refreshSelected);
  disconnect.onclick=()=>{forgetExternal();clear();discover();};
  // Restore only a public watch address. This never restores a Phantom secret,
  // signature session or spending permission; every transaction still needs approval.
  try{
    const saved=JSON.parse(win.localStorage?.getItem('jamd.externalPublicWallet.v1')||'null');
    if(saved?.network==='solana:mainnet'&&typeof saved.address==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(saved.address)){
      const name=sanitizeWalletName(saved.name);selectWalletAccount(doc,{address:saved.address,source:'external',name});
      active={kind:'remembered-public',address:saved.address,name};identity.textContent=name+' · '+t('Cuenta pública recordada','Remembered public account')+' · '+saved.address;
      // A remembered address cannot restore a signing session. Let the user
      // reconnect in-place, without first deleting their public watch address.
      refresh.hidden=disconnect.hidden=false;connect.hidden=false;select.disabled=false;connect.textContent=t('Volver a conectar billetera','Reconnect wallet');refresh.onclick();
      refreshTimer=setInterval(()=>{if(!doc.hidden)refresh.onclick();},60000);refreshTimer?.unref?.();
    }
  }catch{}
  return ()=>{disposeAccountLink();disposeTrading();disposeTradingPanel();doc.removeEventListener?.('jamd-wallet-refresh',refreshSelected);disposeOverview();disposeMain();disposeNative();clear();unregister();unregisterGone();win.removeEventListener('eip6963:announceProvider',announced);panel.remove();};
}
