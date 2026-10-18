import {setupSwapQuote,setupFuturesTicket} from './swap-quote-ui.js';
import {setupFinanceMarkets} from './finance-markets.js';
import {setupFinancePreferences} from './finance-preferences.js';
import {setupFinanceDepth} from './finance-depth.js';
import {setupFinanceActivity} from './finance-activity.js';
import {setupAutomationPanel} from './automation-panel.js';
import {applyFinancePolish} from './finance-polish.js';
import {setupMarketSentiment} from './market-sentiment-ui.js';
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
  const labels=[['home',t('Inicio','Home')],['markets',t('Mercados','Markets')],['trade','Trade'],['futures',t('Futuros','Futures')],['assets',t('Activos','Assets')]];
  let marketView, activeAsset={symbol:'BTC',id:'bitcoin'};
  function select(id){for(const [key,page] of pages){page.hidden=key!==id;buttons.get(key).setAttribute('aria-selected',String(key===id));buttons.get(key).tabIndex=key===id?0:-1;} menu.hidden=true;depth.setActive(id==='trade'||id==='futures');if(marketView&&(id==='home'||id==='markets'))pages.get(id).append(marketView.panel);if(marketView&&(id==='trade'||id==='futures')){if(id==='trade'){chartSlot.insertBefore(marketView.detail,swap.card);}else futuresChart.append(marketView.detail);(id==='futures'?futuresWorkspace:tradeWorkspace).append(book);if(marketView.detail.hidden){marketView.showChart(activeAsset);depth.select(activeAsset.symbol+'USDT');}}}
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
  setupMarketSentiment(pages.get('home'),language,doc);
  setupMarketSentiment(pages.get('markets'),language,doc);
  const shortcuts=doc.createElement('div');shortcuts.className='terminal-shortcuts';hero.append(shortcuts);
  for(const [id,label] of [['assets',t('Ver activos','View assets')],['markets',t('Explorar mercados','Explore markets')],['futures',t('Órdenes manuales','Manual orders')]]){const b=doc.createElement('button');b.textContent=label;b.onclick=()=>select(id);shortcuts.append(b);}
  const assetOverview=card(pages.get('assets'),t('Tus activos','Your assets'),t('Billetera y cuenta de exchange, organizadas por separado. Consulta cada origen para ver su saldo actualizado.','Wallet and exchange account, organized separately. Check each source for its current balance.'));
  assetOverview.className='card account-overview';
  const assetActions=doc.createElement('div');assetActions.className='terminal-shortcuts';assetOverview.append(assetActions);
  for(const [label,action] of [[t('Billetera JamdDmaj','JamdDmaj wallet'),()=>{const target=doc.querySelector('#native-main-wallet');target?.scrollIntoView?.({block:'center'});target?.querySelector?.('button')?.click();}],[t('Cuenta Bitget','Bitget account'),()=>funding.scrollIntoView?.({block:'center'})],[t('Consultar conexión','Check connection'),()=>{connection.querySelector?.('button')?.click();connection.scrollIntoView?.({block:'center'});}]] ) {const b=doc.createElement('button');b.type='button';b.textContent=label;b.onclick=action;assetActions.append(b);}
  funding.className+=' asset-source';connection.className+=' asset-source';pages.get('assets').append(funding,connection);
  const tradeHeader=card(pages.get('trade'),t('Terminal de operaciones','Trading terminal'),t('Selecciona un mercado para ver el gráfico y preparar tu operación.','Select a market to view its chart and prepare your operation.'));
  const tradeWorkspace=doc.createElement('div');tradeWorkspace.className='finance-trade-workspace';pages.get('trade').append(tradeWorkspace);
  const chartSlot=doc.createElement('div');tradeWorkspace.append(chartSlot);
  const book=card(tradeWorkspace,t('Libro de órdenes','Order book'),t('Profundidad de mercado aún no conectada. No se muestran órdenes ni volúmenes ficticios.','Market depth is not connected yet. No fictitious orders or volumes are shown.'));
  book.className='card finance-orderbook';
  const depth=setupFinanceDepth(book,language,doc);
  setupAutomationPanel(pages.get('futures'),language,doc);
  const futuresWorkspace=doc.createElement('div');futuresWorkspace.className='finance-futures-workspace';pages.get('futures').append(futuresWorkspace);
  const futuresChart=doc.createElement('details');futuresChart.className='finance-futures-chart';
  const chartToggle=doc.createElement('summary');chartToggle.textContent=t('Gráfico del par · mostrar / ocultar','Pair chart · show / hide');futuresChart.append(chartToggle);
  const futuresTicket=setupFuturesTicket(futuresWorkspace,language,doc,asset=>{
    activeAsset=asset;futuresTicket.selectAsset(asset);swap.selectAsset(asset);
    marketView.showChart(asset);depth.select(asset.symbol+'USDT');select('futures');
  });
  futuresWorkspace.append(futuresChart);
  const legacy=doc.createElement('details');legacy.className='card';const legacySummary=doc.createElement('summary');legacySummary.textContent=t('Conector anterior Bitget · avanzado','Legacy Bitget connector · advanced');legacy.append(legacySummary,manual);pages.get('assets').append(legacy);
  setupFinanceActivity(pages.get('futures'),language,doc);
  card(pages.get('futures'),t('Estado de operaciones','Trading status'),t('Abrir esta sección no habilita operaciones. El servidor valida la pausa, el saldo y los límites antes de aceptar una solicitud.','Opening this section does not enable trading. The server checks the pause, balance and limits before accepting a request.'));
  const selected=card(pages.get('trade'),t('Elige cómo operar','Choose how to trade'),t('Selecciona una moneda desde Inicio o Mercados.','Select an asset from Home or Markets.'));
  const selectedName=doc.createElement('h3');selected.append(selectedName);
  const futures=doc.createElement('button');futures.textContent=t('Revisar par en Futuros','Review pair in Futures');futures.hidden=true;selected.append(futures);
  const wallet=doc.createElement('button');wallet.textContent=t('Abrir billetera para intercambiar','Open wallet to swap');selected.append(wallet);
  wallet.onclick=()=>{select('assets');doc.querySelector('#native-main-wallet button')?.click();};
  const swap=setupSwapQuote(chartSlot,language,doc);
  marketView=setupFinanceMarkets(pages.get('home'),language,doc,asset=>{
    activeAsset=asset;
    swap.selectAsset(asset);futuresTicket.selectAsset(asset);
    selectedName.textContent=asset.symbol+' / USDT';futures.hidden=false;
    tradeHeader.querySelector?.('h2') && (tradeHeader.querySelector('h2').textContent=asset.symbol+' / USDT');
    chartSlot.insertBefore(marketView.detail,chartSlot.firstChild);marketView.showChart(asset);
    depth.select(asset.symbol+'USDT');
    futures.onclick=()=>{const field=doc.getElementById('manual-review-symbol');field.value=asset.symbol+'USDT';field.dispatchEvent?.(new Event('input',{bubbles:true}));select('futures');};
    select('trade');
    chartSlot.append(swap.card);
  });
  let profile=null;try{profile=JSON.parse(globalThis.localStorage?.getItem('jamdV4AccountProfile')||'null');}catch{}
  const profileShell=doc.createElement('div');profileShell.className='account-shell';
  const profileMenu=doc.createElement('nav');profileMenu.className='account-menu';profileMenu.setAttribute('aria-label',t('Secciones de perfil','Profile sections'));profileShell.append(profileMenu);
  const profileCards=doc.createElement('div');profileCards.className='account-cards';profileShell.append(profileCards);
  const identity=card(profileCards,t('Tu cuenta JamdDmaj','Your JamdDmaj account'),profile?.provider==='google'&&typeof profile.email==='string'?t('Cuenta Google guardada en este dispositivo: ','Google account saved on this device: ')+profile.email:t('No hay una cuenta Google guardada en este dispositivo.','No Google account is saved on this device.'));
  identity.className='card account-overview';identity.id='profile-account';
  const accountLink=doc.createElement('a');accountLink.href='./index.html';accountLink.textContent=t('Gestionar cuenta en la app','Manage account in the app');identity.append(accountLink);
  const security=card(profileCards,t('Seguridad y recuperación','Security and recovery'),t('El perfil guardado no verifica una sesión vigente. Google no restaura las claves de tu billetera: conserva el respaldo cifrado y su contraseña. Conectar una billetera externa tampoco importa sus claves.','A saved profile does not verify a current session. Google does not restore wallet keys: keep your encrypted backup and password. Connecting an external wallet does not import its keys.'));security.id='profile-security';
  const appearance=doc.createElement('div');appearance.id='profile-appearance';profileCards.append(appearance);
  const disposePreferences=setupFinancePreferences(appearance,language,doc);
  const connections=card(profileCards,t('Billeteras y conexiones','Wallets and connections'),t('Gestiona tu billetera JamdDmaj y las conexiones externas desde Activos.','Manage your JamdDmaj wallet and external connections in Assets.'));connections.id='profile-wallets';
  for(const [label,target] of [[t('Cuenta','Account'),identity],[t('Seguridad','Security'),security],[t('Billeteras','Wallets'),connections],[t('Tema y configuración','Theme and settings'),appearance]]){const b=doc.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{target.scrollIntoView?.({block:'center'});target.setAttribute('tabindex','-1');target.focus?.({preventScroll:true});};profileMenu.append(b);}
  const manageWallets=doc.createElement('button');manageWallets.textContent=t('Gestionar billeteras','Manage wallets');manageWallets.onclick=()=>select('assets');connections.append(manageWallets);
  // The profile drawer reuses the same controls; opening it does not change the Home tab.
  if(typeof doc.createElement('dialog').showModal==='function'){
    const drawer=doc.createElement('dialog');drawer.className='profile-drawer';drawer.setAttribute('aria-label',t('Perfil y configuración','Profile and settings'));
    const close=doc.createElement('button');close.type='button';close.textContent=t('Cerrar perfil','Close profile');close.onclick=()=>drawer.close();drawer.append(close);doc.body.append(drawer);
    const opener=doc.createElement('button');opener.type='button';opener.textContent=t('☰ Perfil','☰ Profile');opener.className='profile-opener';opener.setAttribute('aria-haspopup','dialog');opener.onclick=()=>{drawer.append(profileShell);drawer.showModal();};pages.get('home').insertBefore(opener,hero);
    drawer.addEventListener('close',()=>{opener.focus();});
    manageWallets.onclick=()=>{if(drawer.open)drawer.close();select('assets');};
    style.textContent+='.profile-opener{justify-self:end}.profile-drawer{background:#101a2a;color:#e5edf8;border:1px solid #354a66;border-radius:18px;width:min(900px,94vw);max-height:88dvh;padding:20px}.profile-drawer::backdrop{background:#0009}.profile-drawer>.account-shell{margin-top:16px}[data-finance-theme=light] .profile-drawer{background:#fff;color:#15213a}@media(max-width:760px){.profile-drawer{margin:12px 12px auto auto;width:calc(100vw - 24px)}}';
  }
  style.textContent += '.account-shell{display:grid;grid-template-columns:190px minmax(0,1fr);gap:22px;align-items:start}.account-menu{position:sticky;top:16px;display:grid;gap:8px}.account-menu button{text-align:left;background:transparent;border-color:transparent;min-height:48px}.account-menu button:hover,.account-menu button:focus-visible{background:#253354;border-color:#65e4cf}.account-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.account-cards>*{min-width:0;overflow-wrap:anywhere}.account-overview{grid-column:1/-1;background:linear-gradient(120deg,#101a2a,#102b30);padding:26px!important}.account-overview h2{font-size:25px}.account-cards .card{height:100%}.account-cards a{color:#65e4cf;display:inline-block;padding:12px 0}.asset-source{border-top:3px solid #284e60}#terminal-assets{grid-template-columns:repeat(2,minmax(0,1fr))}#terminal-assets>.account-overview{grid-column:1/-1}[data-finance-theme=light] .account-overview{background:#e1f2ee;color:#15213a}@media(max-width:760px){.account-shell{grid-template-columns:1fr}.account-menu{position:static;display:flex;overflow-x:auto}.account-menu button{flex:0 0 auto}.account-cards,#terminal-assets{grid-template-columns:1fr}.account-overview{padding:20px!important}}';
  style.textContent += '.finance-market-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #26334b}.finance-market-row button:first-child{text-align:left;overflow-wrap:anywhere;background:transparent;border:0}.finance-markets input{width:100%;box-sizing:border-box}.finance-markets svg{display:block;width:100%;max-height:240px}.terminal-nav button{font-size:12px;min-height:48px}.terminal-page{animation:terminal-in .18s ease-out}button{transition:background .15s,transform .15s}button:active{transform:scale(.98)}@keyframes terminal-in{from{opacity:.6;transform:translateY(5px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.terminal-page{animation:none}button{transition:none}}';
  style.textContent += '.finance-trade-workspace{display:grid;grid-template-columns:minmax(0,2fr) minmax(160px,1fr);gap:14px}.finance-trade-workspace svg{width:100%;min-height:200px}.finance-setting{display:flex;align-items:center;gap:12px;padding:14px 0}.finance-setting input{width:auto}#finance-theme{display:block;width:100%;margin:12px 0}[data-finance-compact=true] .finance-market-row{padding:5px 0}[data-finance-motion=false] .terminal-page{animation:none}[data-finance-motion=false] button{transition:none}[data-finance-theme=light] body{background:#f1f4fa;color:#15213a}[data-finance-theme=light] .card,[data-finance-theme=light] .terminal-nav{background:#fff;color:#15213a;border-color:#c5cede}[data-finance-theme=light] input,[data-finance-theme=light] select,[data-finance-theme=light] button{background:#edf0f9;color:#15213a;border-color:#c5cede}[data-finance-theme=light] .terminal-hero{background:linear-gradient(125deg,#e3d9ff,#d2f4ed);color:#15213a}[data-finance-theme=light] p{color:#43536c}@media(max-width:520px){.finance-trade-workspace{grid-template-columns:1fr}.finance-orderbook{padding:14px}}';
  style.textContent += '.finance-futures-workspace{display:grid;grid-template-columns:minmax(0,2fr) minmax(180px,.8fr) minmax(260px,1fr);gap:12px;align-items:start}.finance-futures-chart{grid-column:1;min-width:0}.finance-futures-workspace .finance-orderbook{grid-column:2;grid-row:1;min-width:0}.finance-futures-order{grid-column:3;grid-row:1;min-width:0}.finance-futures-chart svg{width:100%;min-height:300px}.finance-futures-order input,.finance-futures-order select{box-sizing:border-box;max-width:100%}.finance-futures-workspace .card{padding:16px}.finance-futures-order button[aria-pressed=true]{background:#137c69;color:white}@media(max-width:950px){.finance-futures-workspace{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.finance-futures-chart{grid-column:1/-1}.finance-futures-workspace .finance-orderbook{grid-column:1;grid-row:2}.finance-futures-order{grid-column:2;grid-row:2}}@media(max-width:540px){.finance-futures-workspace{grid-template-columns:1fr}.finance-futures-workspace .finance-orderbook,.finance-futures-order{grid-column:1;grid-row:auto}.finance-futures-chart svg{min-height:210px}}';
  doc.defaultView?.addEventListener('pagehide',()=>{marketView.dispose();disposePreferences();depth.dispose();},{once:true});
  applyFinancePolish(doc,language);
  select('home');
}
