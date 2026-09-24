import {getWalletRegistry} from './lib/wallet-standard-registry.js';
import {getCompatibleSolanaWallets,getSolanaAccount,sanitizeWalletName} from './lib/wallet-security.js';
import {createEvmReadOnlySession} from './lib/external-wallet-session.js';
import {setupNativeWalletEntry} from './native-wallet-entry.js';

export function setupAssetsWallets(language, doc=document, win=window) {
  const host=doc.getElementById('terminal-assets');if(!host)return;
  const t=(es,en)=>language==='es'?es:en;
  const panel=doc.createElement('section');panel.className='card';panel.id='external-wallet-assets';
  const el=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;panel.append(n);return n;};
  el('h2',t('Tu billetera externa','Your external wallet'));
  el('p',t('Conecta para consultar tu cuenta pública. Las claves permanecen en tu billetera. Esta conexión no inicia sesión, no firma ni mueve dinero. Es independiente de Bitget.','Connect to inspect your public account. Keys stay in your wallet. This connection does not sign you in, sign messages or move funds. It is separate from Bitget.'));
  const label=el('label',t('Billetera detectada','Detected wallet'));label.htmlFor='assets-wallet-choice';
  const select=el('select');select.id='assets-wallet-choice';
  const connect=el('button',t('Conectar billetera','Connect wallet'));connect.type='button';
  const refresh=el('button',t('Consultar saldo nativo','Check native balance'));refresh.type='button';refresh.hidden=true;
  const disconnect=el('button',t('Desconectar de esta vista','Disconnect from this view'));disconnect.type='button';disconnect.hidden=true;
  const identity=el('p');identity.style.overflowWrap='anywhere';
  const balance=el('p');const status=el('p');status.setAttribute('role','status');
  const note=el('p',t('Consulta SOL, ETH o BNB; no es un inventario de todos tus tokens. Desconectar aquí no revoca los permisos guardados en tu billetera.','Shows SOL, ETH or BNB; not a complete token inventory. Disconnecting here does not revoke permissions saved in your wallet.'));
  note.className='notes';host.prepend(panel);
  const disposeNative=setupNativeWalletEntry(language,doc,win);
  const registry=getWalletRegistry(),providers=new Map();let choices=[],session=null,removeChange=null,epoch=0,busy=false,active=null;
  function clear(){epoch++;active=null;const old=session;session=null;old?.disconnect();removeChange?.();removeChange=null;identity.textContent='';balance.textContent='';refresh.hidden=disconnect.hidden=true;select.disabled=false;connect.hidden=false;}
  function invalid(){clear();status.textContent=t('La cuenta o red cambió. Vuelve a conectar.','Account or network changed. Connect again.');}
  function discover(){
    if(active||busy)return;
    const previous=select.value;
    choices=getCompatibleSolanaWallets([...registry.get()]).map(({wallet,name})=>({kind:'solana',wallet,name}));
    for(const [provider,name] of providers)choices.push({kind:'evm',provider,name});
    select.replaceChildren();
    choices.forEach((choice,i)=>{const option=doc.createElement('option');option.value=String(i);option.textContent=choice.name+' · '+(choice.kind==='solana'?'Solana':'Ethereum / BNB');select.append(option)});
    if(choices[Number(previous)])select.value=previous;
    connect.disabled=!choices.length;
    if(!choices.length)status.textContent=t('No hay una billetera compatible en este navegador. La app Android necesita una conexión móvil específica; no crearemos una cuenta ficticia.','No compatible wallet is available in this browser. Android needs a separate mobile connection; no fictitious account will be created.');
    else status.textContent=t('Selecciona la billetera que reconoces. Los nombres son informados por las extensiones.','Select a wallet you recognize. Names are supplied by browser extensions.');
  }
  function announced(event){try{const p=event.detail?.provider;if(typeof p?.request==='function'&&typeof p?.on==='function'&&typeof p?.removeListener==='function'&&providers.size<20){providers.set(p,sanitizeWalletName(event.detail.info?.name));discover();}}catch{}}
  win.addEventListener('eip6963:announceProvider',announced);
  const unregister=registry.on('register',discover),unregisterGone=registry.on('unregister',(...removed)=>{if(removed.includes(active?.wallet))invalid();discover()});
  try{if(win.ethereum)announced({detail:{provider:win.ethereum,info:{name:t('Billetera EVM del navegador','Browser EVM wallet')}}});}catch{}
  win.dispatchEvent(new Event('eip6963:requestProvider'));discover();
  connect.onclick=async()=>{
    if(busy)return;const choice=choices[Number(select.value)];if(!choice)return;
    clear();busy=true;connect.disabled=true;select.disabled=true;const ticket=epoch;
    status.textContent=t('Confirma la conexión en tu billetera.','Approve the connection in your wallet.');
    try{
      let account;
      if(choice.kind==='evm'){
        session=createEvmReadOnlySession(choice.provider,value=>{if(!value&&active)invalid()});
        const result=await session.connect();account={address:result.address,network:result.name};
      }else{
        const result=await choice.wallet.features['standard:connect'].connect();
        const selected=getSolanaAccount(result.accounts);
        if(!selected?.chains.includes('solana:mainnet'))throw new Error('unsupported-network');
        account={address:selected.address,network:'Solana mainnet'};
        if(typeof choice.wallet.features['standard:events']?.on!=='function')throw new Error('unsupported-wallet');
        removeChange=choice.wallet.features['standard:events'].on('change',invalid);
      }
      if(ticket!==epoch)return;
      active={...choice,...account};identity.textContent=choice.name+' · '+account.network+' · '+account.address;
      refresh.hidden=disconnect.hidden=false;connect.hidden=true;
      status.textContent=t('Conectada para consulta. No se ha enviado dinero.','Connected for inspection. No funds were sent.');
    }catch{if(ticket===epoch){clear();status.textContent=t('Conexión cancelada, red no compatible o billetera no disponible. Usa Solana mainnet, Ethereum o BNB Smart Chain.','Connection cancelled, unsupported network or wallet unavailable. Use Solana mainnet, Ethereum or BNB Smart Chain.');}}
    finally{busy=false;connect.disabled=false;select.disabled=!!active;}
  };
  refresh.onclick=async()=>{
    if(!active||busy)return;busy=true;refresh.disabled=true;const ticket=epoch,snapshot=active;balance.textContent='';
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
        amount=String(data.sol.amount);symbol='SOL';
      }
      if(ticket!==epoch)return;balance.textContent=amount+' '+symbol;status.textContent=t('Consultado a las ','Checked at ')+new Date().toLocaleTimeString(language);
    }catch{if(ticket===epoch){balance.textContent='';status.textContent=t('Saldo no disponible. No se sustituye por cero.','Balance unavailable. It is not replaced with zero.');}}
    finally{busy=false;refresh.disabled=false;}
  };
  disconnect.onclick=()=>{clear();discover();};
  return ()=>{disposeNative();clear();unregister();unregisterGone();win.removeEventListener('eip6963:announceProvider',announced);panel.remove();};
}
