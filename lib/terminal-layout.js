// Keep the practice account separate; changing this view never changes trading permissions.
export function setupTerminalLayout(language, doc = document) {
  const es = language === 'es';
  const main = doc.querySelector('main');
  const heading = main.querySelector('h1');
  const intro = heading.nextElementSibling;
  const search = doc.getElementById('searchForm').closest('section');
  const stats = main.querySelector('.stats');
  const notice = stats.previousElementSibling;
  const chart = main.querySelector('.grid');
  const history = doc.getElementById('history').closest('section');
  const t=(a,b)=>es?a:b;
  const funding=doc.getElementById('deposit').closest('section');
  const manual=doc.getElementById('manual-review-symbol').closest('section');
  const connection=manual.nextElementSibling;
  main.querySelector('.badge').textContent = 'JAMDDMAJ / FINANCE';
  heading.textContent = t('Tu espacio financiero','Your finance workspace');
  const menu = doc.createElement('details');
  menu.id = 'practice-menu';
  const summary = doc.createElement('summary');
  summary.textContent = es ? 'Más opciones · Simulador de práctica' : 'More options · Practice simulator';
  summary.style.cssText = 'cursor:pointer;padding:14px 0;color:#9badc5';
  menu.append(summary, intro, search, notice, stats, chart, history);
  main.append(menu);
  // Closed on every visit. Practice positions remain intact when toggling it.
  menu.open = false;
  const style=doc.createElement('style');
  style.textContent=`main{padding-bottom:110px;max-width:1200px}.terminal-nav{position:fixed;bottom:0;left:0;right:0;z-index:20;display:flex;justify-content:center;gap:4px;padding:12px 8px calc(12px + env(safe-area-inset-bottom));background:#101522f5;border-top:1px solid #33415d;backdrop-filter:blur(16px)}.terminal-nav button{flex:1;max-width:170px;padding:12px 4px;border:0;background:transparent;color:#9badc5}.terminal-nav button[aria-selected=true]{background:#253354;color:#65e4cf}.terminal-page{display:grid;gap:16px;margin-top:20px}.terminal-page .card{margin:0}.terminal-hero{background:linear-gradient(125deg,#253354,#112b30);padding:28px;border-radius:20px}.terminal-hero h2{font-size:28px}.terminal-shortcuts{display:flex;gap:10px;flex-wrap:wrap}.terminal-quotes{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.terminal-quotes strong{font-size:24px;display:block;margin-top:10px}`;
  doc.head.append(style);
  const pages=new Map(),buttons=new Map();
  const nav=doc.createElement('nav');nav.className='terminal-nav';nav.setAttribute('aria-label',t('Navegación financiera','Finance navigation'));nav.setAttribute('role','tablist');
  style.textContent += '.terminal-page[hidden]{display:none!important}';
  doc.title = 'JamdDmaj · Finance';
  const labels=[['home',t('Inicio','Home')],['markets',t('Mercados','Markets')],['futures',t('Futuros','Futures')],['assets',t('Activos','Assets')]];
  function select(id){for(const [key,page] of pages){page.hidden=key!==id;buttons.get(key).setAttribute('aria-selected',String(key===id));buttons.get(key).tabIndex=key===id?0:-1;} menu.hidden=id!=='home';}
  for(const [id,label] of labels){
    const page=doc.createElement('section');page.id='terminal-'+id;page.className='terminal-page';page.setAttribute('role','tabpanel');page.setAttribute('aria-labelledby','tab-'+id);pages.set(id,page);main.insertBefore(page,menu);
    const button=doc.createElement('button');button.id='tab-'+id;button.type='button';button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls',page.id);button.onclick=()=>select(id);nav.append(button);buttons.set(id,button);
  }
  doc.body.append(nav);
  nav.addEventListener('keydown',event=>{
    const keys=Array.from(buttons.keys()),current=keys.findIndex(key=>buttons.get(key)===event.target);
    if(current<0)return;
    const next=event.key==='ArrowRight'?(current+1)%keys.length:event.key==='ArrowLeft'?(current+keys.length-1)%keys.length:event.key==='Home'?0:event.key==='End'?keys.length-1:-1;
    if(next<0)return;event.preventDefault();select(keys[next]);buttons.get(keys[next]).focus();
  });
  function card(parent,title,body){const node=doc.createElement('div');node.className='card';const h=doc.createElement('h2');h.textContent=title;const p=doc.createElement('p');p.textContent=body;node.append(h,p);parent.append(node);return node;}
  const hero=card(pages.get('home'),'JamdDmaj',t('Consulta mercados, revisa órdenes manuales y comprueba tu conexión con Bitget.','Explore markets, review manual orders and check your Bitget connection.'));hero.className='terminal-hero';
  const shortcuts=doc.createElement('div');shortcuts.className='terminal-shortcuts';hero.append(shortcuts);
  for(const [id,label] of [['assets',t('Ver activos','View assets')],['markets',t('Explorar mercados','Explore markets')],['futures',t('Órdenes manuales','Manual orders')]]){const b=doc.createElement('button');b.textContent=label;b.onclick=()=>select(id);shortcuts.append(b);}
  card(pages.get('home'),t('Sin saldos inventados','No invented balances'),t('Consulta tu saldo real en Activos. La práctica está guardada en Más opciones. Esta organización no cambia la pausa de operaciones.','Check your real balance in Assets. Practice is under More options. This layout does not change the trading pause.'));
  pages.get('assets').append(funding,connection);
  pages.get('futures').append(manual);
  card(pages.get('futures'),t('Estado de operaciones','Trading status'),t('Abrir esta sección no habilita operaciones. El servidor valida la pausa, el saldo y los límites antes de aceptar una solicitud.','Opening this section does not enable trading. The server checks the pause, balance and limits before accepting a request.'));
  const markets=card(pages.get('markets'),t('Mercados · Referencias públicas','Markets · Public reference prices'),t('Precios en USD; no son cotizaciones ejecutables de futuros.','USD prices; not executable futures quotes.'));
  const quotes=doc.createElement('div');quotes.className='terminal-quotes';markets.append(quotes);
  const refresh=doc.createElement('button');refresh.textContent=t('Actualizar precios','Refresh prices');markets.append(refresh);
  const stamp=doc.createElement('p');stamp.setAttribute('role','status');markets.append(stamp);
  const assets=[['bitcoin','Bitcoin','BTC'],['ethereum','Ethereum','ETH'],['solana','Solana','SOL'],['binancecoin','BNB','BNB']];
  async function prices(){refresh.disabled=true;quotes.replaceChildren();stamp.textContent=t('Consultando…','Loading…');try{
    const base=globalThis.Capacitor?.isNativePlatform?.()?'https://www.jamddmaj.com':'';
    const r=await fetch(base+'/api/token-prices?ids='+assets.map(a=>a[0]).join(','),{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!r.ok)throw new Error('unavailable');const data=await r.json();
    for(const [id,name,symbol] of assets){const row=card(quotes,name+' · '+symbol,'');const value=Number(data[id]?.usd);const amount=doc.createElement('strong');amount.textContent=Number.isFinite(value)&&value>0?value.toLocaleString(language,{style:'currency',currency:'USD'}):t('No disponible','Unavailable');row.append(amount);}
    stamp.textContent=t('Consultado a las ','Fetched at ')+new Date().toLocaleTimeString(language);
  }catch{stamp.textContent=t('Precios no disponibles. No se muestran valores inventados.','Prices unavailable. No invented values are shown.');}finally{refresh.disabled=false;}}
  refresh.onclick=prices;
  select('home');
}
