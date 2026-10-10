import {setupSwapQuote} from './swap-quote-ui.js';
import {setupFinanceMarkets} from './finance-markets.js';
import {setupFinancePreferences} from './finance-preferences.js';
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
  heading.textContent = 'JamdDmaj';
  const menu = doc.createElement('details');
  menu.id = 'practice-menu';
  const summary = doc.createElement('summary');
  summary.textContent = t('Herramientas de práctica','Practice tools');
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
  const labels=[['home',t('Inicio','Home')],['markets',t('Mercados','Markets')],['trade','Trade'],['futures',t('Futuros','Futures')],['assets',t('Activos','Assets')],['profile',t('Perfil','Profile')]];
  let marketView;
  function select(id){for(const [key,page] of pages){page.hidden=key!==id;buttons.get(key).setAttribute('aria-selected',String(key===id));buttons.get(key).tabIndex=key===id?0:-1;} menu.hidden=id!=='profile';if(marketView&&(id==='home'||id==='markets'))pages.get(id).append(marketView.panel);}
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
  const hero=card(pages.get('home'),t('Mercados y tus activos','Markets and your assets'),t('Explora, elige un par y revisa tu operación.','Explore, choose a pair and review your operation.'));hero.className='terminal-hero';
  const shortcuts=doc.createElement('div');shortcuts.className='terminal-shortcuts';hero.append(shortcuts);
  for(const [id,label] of [['assets',t('Ver activos','View assets')],['markets',t('Explorar mercados','Explore markets')],['futures',t('Órdenes manuales','Manual orders')]]){const b=doc.createElement('button');b.textContent=label;b.onclick=()=>select(id);shortcuts.append(b);}
  pages.get('assets').append(funding,connection);
  const tradeHeader=card(pages.get('trade'),t('Terminal de operaciones','Trading terminal'),t('Selecciona un mercado para ver el gráfico y preparar tu operación.','Select a market to view its chart and prepare your operation.'));
  const tradeWorkspace=doc.createElement('div');tradeWorkspace.className='finance-trade-workspace';pages.get('trade').append(tradeWorkspace);
  const chartSlot=doc.createElement('div');tradeWorkspace.append(chartSlot);
  const book=card(tradeWorkspace,t('Libro de órdenes','Order book'),t('Profundidad de mercado aún no conectada. No se muestran órdenes ni volúmenes ficticios.','Market depth is not connected yet. No fictitious orders or volumes are shown.'));
  book.className='card finance-orderbook';
  pages.get('futures').append(manual);
  card(pages.get('futures'),t('Estado de operaciones','Trading status'),t('Abrir esta sección no habilita operaciones. El servidor valida la pausa, el saldo y los límites antes de aceptar una solicitud.','Opening this section does not enable trading. The server checks the pause, balance and limits before accepting a request.'));
  const selected=card(pages.get('trade'),t('Elige cómo operar','Choose how to trade'),t('Selecciona una moneda desde Inicio o Mercados.','Select an asset from Home or Markets.'));
  const selectedName=doc.createElement('h3');selected.append(selectedName);
  const futures=doc.createElement('button');futures.textContent=t('Revisar par en Futuros','Review pair in Futures');futures.hidden=true;selected.append(futures);
  const wallet=doc.createElement('button');wallet.textContent=t('Abrir billetera para intercambiar','Open wallet to swap');selected.append(wallet);
  wallet.onclick=()=>{select('assets');doc.querySelector('#native-main-wallet button')?.click();};
  setupSwapQuote(pages.get('trade'),language,doc);
  marketView=setupFinanceMarkets(pages.get('home'),language,doc,asset=>{
    selectedName.textContent=asset.symbol+' / USDT';futures.hidden=false;
    tradeHeader.querySelector?.('h2') && (tradeHeader.querySelector('h2').textContent=asset.symbol+' / USDT');
    chartSlot.append(marketView.detail);marketView.showChart(asset);
    futures.onclick=()=>{const field=doc.getElementById('manual-review-symbol');field.value=asset.symbol+'USDT';field.dispatchEvent?.(new Event('input',{bubbles:true}));select('futures');};
    select('trade');
  });
  let profile=null;try{profile=JSON.parse(globalThis.localStorage?.getItem('jamdV4AccountProfile')||'null');}catch{}
  const identity=card(pages.get('profile'),t('Tu perfil','Your profile'),profile?.provider==='google'&&typeof profile.email==='string'?t('Cuenta Google guardada en este dispositivo: ','Google account saved on this device: ')+profile.email:t('No hay una cuenta Google guardada en este dispositivo.','No Google account is saved on this device.'));
  const accountLink=doc.createElement('a');accountLink.href='./index.html';accountLink.textContent=t('Gestionar cuenta en la app','Manage account in the app');identity.append(accountLink);
  card(pages.get('profile'),t('Acceso y recuperación','Access and recovery'),t('El perfil guardado no verifica una sesión vigente. Google no restaura las claves de tu billetera: conserva el respaldo cifrado y su contraseña. Conectar una billetera externa tampoco importa sus claves.','A saved profile does not verify a current session. Google does not restore wallet keys: keep your encrypted backup and password. Connecting an external wallet does not import its keys.'));
  const disposePreferences=setupFinancePreferences(pages.get('profile'),language,doc);
  const connections=card(pages.get('profile'),t('Billeteras y conexiones','Wallets and connections'),t('Gestiona tu billetera JamdDmaj y las conexiones externas desde Activos.','Manage your JamdDmaj wallet and external connections in Assets.'));
  const manageWallets=doc.createElement('button');manageWallets.textContent=t('Gestionar billeteras','Manage wallets');manageWallets.onclick=()=>select('assets');connections.append(manageWallets);
  style.textContent += '.finance-market-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #26334b}.finance-market-row button:first-child{text-align:left;overflow-wrap:anywhere;background:transparent;border:0}.finance-markets input{width:100%;box-sizing:border-box}.finance-markets svg{display:block;width:100%;max-height:240px}.terminal-nav button{font-size:12px;min-height:48px}.terminal-page{animation:terminal-in .18s ease-out}button{transition:background .15s,transform .15s}button:active{transform:scale(.98)}@keyframes terminal-in{from{opacity:.6;transform:translateY(5px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.terminal-page{animation:none}button{transition:none}}';
  style.textContent += '.finance-trade-workspace{display:grid;grid-template-columns:minmax(0,2fr) minmax(160px,1fr);gap:14px}.finance-trade-workspace svg{width:100%;min-height:200px}.finance-setting{display:flex;align-items:center;gap:12px;padding:14px 0}.finance-setting input{width:auto}#finance-theme{display:block;width:100%;margin:12px 0}[data-finance-compact=true] .finance-market-row{padding:5px 0}[data-finance-motion=false] .terminal-page{animation:none}[data-finance-motion=false] button{transition:none}[data-finance-theme=light] body{background:#f1f4fa;color:#15213a}[data-finance-theme=light] .card,[data-finance-theme=light] .terminal-nav{background:#fff;color:#15213a;border-color:#c5cede}[data-finance-theme=light] input,[data-finance-theme=light] select,[data-finance-theme=light] button{background:#edf0f9;color:#15213a;border-color:#c5cede}[data-finance-theme=light] .terminal-hero{background:linear-gradient(125deg,#e3d9ff,#d2f4ed);color:#15213a}[data-finance-theme=light] p{color:#43536c}@media(max-width:520px){.finance-trade-workspace{grid-template-columns:1fr}.finance-orderbook{padding:14px}}';
  doc.defaultView?.addEventListener('pagehide',()=>{marketView.dispose();disposePreferences();},{once:true});
  select('home');
}
