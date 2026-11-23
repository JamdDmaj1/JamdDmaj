// In-app and Telegram notices for automatic Jupiter positions. Positions in
// the bot wallet are automation positions (manual futures live in Phoenix).
import {currentWalletTradingState} from './wallet-trading-state.js';
import {readExistingPerpsControlSession} from './perps-control-client.js';

const KEY='jamd.autoTradeNotices.v1';
const MAX_SEEN=40;

export function setupAutoTradeNotifications({doc=document,win=window,language='es'}={}){
  const t=(es,en)=>language==='es'?es:en;
  const node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
  let stored={};
  try{const raw=JSON.parse(win.localStorage?.getItem(KEY)||'{}');if(raw&&typeof raw==='object'&&!Array.isArray(raw))stored=raw;}catch{}
  let seen=new Map(Object.entries(stored).filter(([address,v])=>typeof address==='string'&&v&&typeof v==='object').slice(-MAX_SEEN));
  let initialized=false,disposed=false;
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
    try{if(win.Notification?.permission==='granted')new win.Notification(t('JamdDmaj · Automatic Trades','JamdDmaj · Automatic Trades'),{body:text,tag:id,icon:'/icon-192.png'});}catch{}
  }
  async function telegram(event,position){
    try{
      const token=readExistingPerpsControlSession(win);
      if(!/^[a-f0-9]{64}$/.test(token))return;
      await win.fetch('/api/auto-trade-notify',{method:'POST',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(8000),
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({event,symbol:position.asset,side:position.side,marginUsdcUnits:String(position.collateralUsdcUnits||'0'),entryPriceUsd:String(position.priceUsdUnits||'0')})});
    }catch{}
  }
  function save(){try{win.localStorage?.setItem(KEY,JSON.stringify(Object.fromEntries([...seen].slice(-MAX_SEEN))));}catch{}}
  function tick(){
    if(disposed)return;
    let positions;
    try{positions=currentWalletTradingState(doc)?.snapshot?.positions;}catch{return;}
    if(!Array.isArray(positions))return;
    const current=new Map(positions.filter(p=>p&&typeof p.address==='string').map(p=>[p.address,{asset:p.asset,side:p.side,collateralUsdcUnits:p.collateralUsdcUnits,priceUsdUnits:p.priceUsdUnits}]));
    if(!initialized){
      // Do not fire a burst for positions that already existed before this tab.
      for(const address of current.keys())if(!seen.has(address))seen.set(address,current.get(address));
      initialized=true;save();return;
    }
    for(const [address,p]of current){
      if(seen.has(address))continue;
      const text=t('AUTO · ','AUTO · ')+p.asset+' '+(p.side||'')+t(' abierto · margen ',' opened · margin ')+amount(p.collateralUsdcUnits)+' USDC';
      notice(text,'auto-open-'+address);void telegram('OPEN',p);
    }
    for(const [address,p]of seen){
      if(current.has(address))continue;
      const text=t('AUTO · ','AUTO · ')+p.asset+' '+(p.side||'')+t(' cerrado',' closed');
      notice(text,'auto-close-'+address);void telegram('CLOSE',p);
    }
    seen=current;save();
  }
  const onChange=()=>tick();
  doc.addEventListener?.('jamd-trading-state',onChange);
  const timer=setInterval(tick,15000);timer?.unref?.();
  tick();
  return Object.freeze({tick,dispose(){disposed=true;clearInterval(timer);clearTimeout(toastTimer);doc.removeEventListener?.('jamd-trading-state',onChange);toast.remove?.();}});
}
