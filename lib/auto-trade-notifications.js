// In-app and Telegram notices for automatic positions. Jupiter positions come
// from the wallet snapshot; Phoenix AUTO workflows come from the Phoenix panel.
import {currentWalletTradingState} from './wallet-trading-state.js';
import {readExistingPerpsControlSession} from './perps-control-client.js';

const KEY='jamd.autoTradeNotices.v1';
const PHX_KEY='jamd.autoTradeNotices.phoenix.v1';
const MAX_SEEN=40;

export function setupAutoTradeNotifications({doc=document,win=window,language='es'}={}){
  const t=(es,en)=>language==='es'?es:en;
  const node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
  const load=key=>{
    try{const raw=JSON.parse(win.localStorage?.getItem(key)||'{}');if(raw&&typeof raw==='object'&&!Array.isArray(raw))return new Map(Object.entries(raw).slice(-MAX_SEEN));}catch{}
    return new Map();
  };
  let seen=load(KEY),phoenixSeen=load(PHX_KEY);
  let initialized=false,phoenixInitialized=false,disposed=false;
  const toast=node('div');
  toast.id='auto-trade-notice';toast.setAttribute('role','status');toast.hidden=true;
  toast.style.cssText='position:fixed;right:16px;bottom:104px;z-index:120;max-width:340px;padding:16px 18px;border:1px solid #d9a44188;border-radius:14px;background:#171d2b;color:#fff;box-shadow:0 16px 40px #0008;font-size:14px;line-height:1.45';
  doc.body?.append(toast);
  let toastTimer;
  function amount(units){const text=String(units??'0').padStart(7,'0'),fraction=text.slice(-6).replace(/0+$/,'');return text.slice(0,-6)+(fraction?'.'+fraction:'')}
  function notice(text,id){
    if(toastTimer)clearTimeout(toastTimer);
    toast.textContent=text;toast.hidden=false;
    toastTimer=setTimeout(()=>{toast.hidden=true;},9000);
    try{if(win.Notification?.permission==='granted')new win.Notification(t('JamdDmaj Â· Automatic Trades','JamdDmaj Â· Automatic Trades'),{body:text,tag:id,icon:'/icon-192.png'});}catch{}
  }
  async function telegram(event,position){
    try{
      const token=readExistingPerpsControlSession(win);
      if(!/^[a-f0-9]{64}$/.test(token))return;
      await win.fetch('/api/auto-trade-notify',{method:'POST',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(8000),
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({event,symbol:position.asset,side:position.side,marginUsdcUnits:String(position.collateralUsdcUnits||'0'),entryPriceUsd:String(position.priceUsdUnits||'0'),slUsdcUnits:position.slUsdcUnits||'',tp1UsdcUnits:position.tp1UsdcUnits||'',exitPriceUsd:position.exitPriceUsd||'',pnlUsdcUnits:position.pnlUsdcUnits||''})});
    }catch{}
  }
  const save=(key,map)=>{try{win.localStorage?.setItem(key,JSON.stringify(Object.fromEntries([...map].slice(-MAX_SEEN))));}catch{}}
  function announce(event,position,id){
    const text='AUTO Â· '+position.asset+' '+(position.side||'')+(event==='OPEN'?t(' abierto Â· margen ',' opened Â· margin ')+amount(position.collateralUsdcUnits)+' USDC':t(' cerrado',' closed'));
    notice(text,id);void telegram(event,position);
  }
  function tick(){
    if(disposed)return;
    let positions;
    try{positions=currentWalletTradingState(doc)?.snapshot?.positions;}catch{return;}
    if(!Array.isArray(positions))return;
    const current=new Map(positions.filter(p=>p&&typeof p.address==='string').map(p=>[p.address,{asset:p.asset,side:p.side,collateralUsdcUnits:p.collateralUsdcUnits,priceUsdUnits:p.priceUsdUnits}]));
    if(!initialized){
      for(const address of current.keys())if(!seen.has(address))seen.set(address,current.get(address));
      initialized=true;save(KEY,seen);return;
    }
    for(const [address,p]of current)if(!seen.has(address))announce('OPEN',p,'auto-open-'+address);
    for(const [address,p]of seen)if(!current.has(address))announce('CLOSE',p,'auto-close-'+address);
    seen=current;save(KEY,seen);
  }
  function phoenixTick(items){
    if(disposed||!Array.isArray(items))return;
    const current=new Map(items.filter(item=>item?.automation===true&&typeof item.workflowId==='string').map(item=>[item.workflowId,{
      asset:item.symbol,side:item.side,collateralUsdcUnits:item.marginUsdcUnits,priceUsdUnits:item.entryPriceUsd,slUsdcUnits:item.slUsdcUnits||null,tp1UsdcUnits:item.tp1UsdcUnits||null
    }]));
    if(!phoenixInitialized){
      for(const [id,p]of current)if(!phoenixSeen.has(id))phoenixSeen.set(id,p);
      phoenixInitialized=true;save(PHX_KEY,phoenixSeen);return;
    }
    for(const [id,p]of current)if(!phoenixSeen.has(id))announce('OPEN',p,'phoenix-auto-open-'+id);
    for(const [id,p]of phoenixSeen)if(!current.has(id))announce('CLOSE',p,'phoenix-auto-close-'+id);
    phoenixSeen=current;save(PHX_KEY,phoenixSeen);
  }
  const onChange=()=>tick();
  const onPhoenix=event=>phoenixTick(event?.detail?.items);
  doc.addEventListener?.('jamd-trading-state',onChange);
  doc.addEventListener?.('jamd-phoenix-positions',onPhoenix);
  const timer=setInterval(tick,15000);timer?.unref?.();
  tick();
  return Object.freeze({tick,phoenixTick,dispose(){disposed=true;clearInterval(timer);clearTimeout(toastTimer);doc.removeEventListener?.('jamd-trading-state',onChange);doc.removeEventListener?.('jamd-phoenix-positions',onPhoenix);toast.remove?.();}});
}

