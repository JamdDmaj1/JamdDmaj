import {bindWalletDisplay} from './wallet-display.js';
import {createPhoenixManualClient} from './phoenix-manual-client.js';
import {computeTradeSignal} from './finance-markets.js?v=20261113c';
import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {currentWalletTradingState} from './wallet-trading-state.js';
import {perpsNavigationDraft} from './perps-navigation.js';
import {readWebPerpsWalletSession} from './perps-web-wallet-session.js';
import {setupWebPerpsRecovery} from './perps-web-recovery-ui.js';
import {createManualPerpsPolicyClient,setupManualPerpsPolicyPanel} from './perps-manual-policy-panel.js';
import {setupWebPerpsOrderPanel} from './perps-web-order-panel.js';
import {readExistingPerpsControlSession} from './perps-control-client.js';
import {setupBotManualPerpsPanel} from './bot-manual-perps-panel.js';
import {readPerpsMarketReference} from './perps-market-reference.js';
const TOKENS = {
  SOL: { mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
  USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 }
};
export function exactSwapUnits(value, decimals) {
  if (!/^\d+(\.\d+)?$/.test(value) || value.length > 40) throw new Error('amount');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error('precision');
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0'));
  if (units < 1n || units > (1n << 64n) - 1n) throw new Error('range');
  return units.toString();
}
export function setupSwapQuote(parent, language, doc = document) {
  const t = (es, en) => language === 'es' ? es : en;
  const node = (tag, text) => { const el = doc.createElement(tag); if (text) el.textContent = text; return el; };
  const card = node('section'); card.className = 'card';
  const heading=node('h2',t('Comprar SOL','Buy SOL'));
  const availability=node('p');availability.className='swap-market-availability';
  card.className+=' finance-inline-buy';
  card.append(heading,
    node('p', t('Consulta una estimacion SOL a USDC o abre el intercambio seguro de tu billetera JamdDmaj. Consultar no mueve fondos; cada intercambio requiere revision y aprobacion.', 'Look up a SOL a USDC estimate or open your JamdDmaj wallet secure swap. Quotes do not move funds; each swap requires review and approval.')));
  const direction = node('select');
  for (const value of ['SOL', 'USDC']) { const option = node('option', value === 'SOL' ? 'SOL a USDC' : 'USDC " " SOL'); option.value = value; direction.append(option); }
  direction.value = 'USDC'; direction.id = 'swap-direction';
  const directionLabel = node('label', t('Entregas y recibes', 'Pay and receive')); directionLabel.htmlFor = direction.id;
  const amount = node('input'); amount.id = 'swap-amount'; amount.inputMode = 'decimal'; amount.autocomplete = 'off';
  const amountLabel = node('label', t('Cantidad que entregas', 'Amount you pay')); amountLabel.htmlFor = amount.id;
  const button = node('button', t('Consultar cotizacion', 'Get quote'));button.id='swap-quote-button'; button.type = 'button';
  const status = node('p');status.id='swap-status'; status.setAttribute('role', 'status');
  const balance=node('p',t('Saldo disponible - USDC: - (billetera sin consultar)','Available balance - USDC: - (wallet not checked)'));
  const slider=node('input');slider.type='range';slider.min='0';slider.max='100';slider.value='0';slider.disabled=true;slider.setAttribute('aria-label',t('Porcentaje del saldo disponible','Percentage of available balance'));
  const sizing=node('div');sizing.className='trade-size-presets';
  for(const percent of [25,50,75,100]){const b=node('button',percent+'%');b.type='button';b.onclick=()=>{if(slider.disabled){status.textContent=t('Actualiza el saldo en Activos antes de elegir un porcentaje.','Refresh your balance in Assets before choosing a percentage.');return;}slider.value=String(percent);slider.oninput?.();};sizing.append(b);}
  card.append(availability,balance,directionLabel, direction, amountLabel, amount,slider,sizing, button, status); parent.append(card);
  const reviewNative=node('button',t('Intercambiar SOL a USDC en mi billetera','Swap SOL a USDC in my wallet'));reviewNative.type='button';
  reviewNative.onclick=()=>{
    if(selectedWalletAccount(doc)?.source!=='native'){status.textContent=t('Selecciona tu billetera JamdDmaj en Activos. Esta entrada abre el swap nativo SOL a USDC; no opera otra billetera.','Select your JamdDmaj wallet in Assets. This entry opens native SOL a USDC swap; it cannot trade another wallet.');return;}
    const Type=doc.defaultView?.Event||globalThis.Event;if(Type)doc.dispatchEvent?.(new Type('jamd-wallet-open-swap'));
    status.textContent=t('Revisa tokens e importe en la pantalla segura. Esta accion no firma ni envia dinero.','Review tokens and amount on the secure screen. This action does not sign or send funds.');
  };card.append(reviewNative);
  let supported=true;
  const refreshSizing=bindWalletDisplay(doc,language,balance,slider,amount,()=>supported&&direction.value==='USDC');
  let revision = 0, timer;
  function clear() { revision++; clearTimeout(timer); status.textContent = ''; button.disabled = !supported; }
  amount.addEventListener('input', clear); direction.addEventListener('change', ()=>{
    clear();amount.value='';slider.value='0';slider.disabled=true;
    heading.textContent=direction.value==='SOL'?t('Vender SOL','Sell SOL'):t('Comprar SOL','Buy SOL');
    button.textContent=direction.value==='SOL'?t('Cotizar venta de SOL','Quote sale of SOL'):t('Cotizar compra de SOL','Quote purchase of SOL');
    amountLabel.textContent=direction.value==='SOL'?t('Cantidad en SOL','Amount in SOL'):t('Importe en USDC (no USD bancarios)','Amount in USDC (not bank USD)');
    status.textContent=direction.value==='SOL'?t('Introduce SOL manualmente. El porcentaje de USDC no se aplica a SOL.','Enter SOL manually. USDC percentage sizing does not apply to SOL.'):t('Actualiza el saldo en Activos para usar el porcentaje de USDC.','Refresh Assets balance to use USDC percentage sizing.');
    refreshSizing();
  });
  button.onclick = async () => {
    if(!supported)return;
    clear(); const ticket = revision;
    const input = TOKENS[direction.value], output = TOKENS[direction.value === 'SOL' ? 'USDC' : 'SOL'];
    let units;
    try { units = exactSwapUnits(amount.value.trim(), input.decimals); }
    catch { status.textContent = t('Introduce una cantidad valida, sin redondear decimales.', 'Enter a valid amount without rounding decimals.'); return; }
    button.disabled = true; status.textContent = t('Consultando...', 'Loading...');
    try {
      const base = globalThis.Capacitor?.isNativePlatform?.() ? 'https://www.jamddmaj.com' : '';
      const response = await fetch(base + '/api/swap-quote?' + new URLSearchParams({ inputMint: input.mint, outputMint: output.mint, amount: units }), { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('unavailable');
      const { quote } = await response.json();
      if (ticket !== revision) return;
      if (quote?.executable !== false || quote.inputMint !== input.mint || quote.outputMint !== output.mint || quote.inAmount !== units || !/^[1-9]\d{0,19}$/.test(quote.outAmount) || !Number.isFinite(quote.expiresAt) || quote.expiresAt <= Date.now() || quote.expiresAt > Date.now() + 15000) throw new Error('invalid');
      const digits = quote.outAmount.padStart(output.decimals + 1, '0');
      const displayed = digits.slice(0, -output.decimals) + '.' + digits.slice(-output.decimals);
      status.textContent = t('Salida estimada: ', 'Estimated output: ') + displayed + (direction.value === 'SOL' ? ' USDC' : ' SOL') + t(' - No es una orden.', ' - Not an order.');
      timer = setTimeout(() => { if (ticket === revision) status.textContent = t('Cotizacion vencida. Consulta de nuevo.', 'Quote expired. Request again.'); }, quote.expiresAt - Date.now());
    } catch { if (ticket === revision) status.textContent = t('Cotizacion no disponible. No se ha enviado ninguna operacion.', 'Quote unavailable. No transaction was submitted.'); }
    finally { if (ticket === revision) button.disabled = !supported; }
  };
  return {card,selectAsset(asset){
    clear();const symbol=String(asset.symbol||'');
    supported=symbol==='SOL';reviewNative.disabled=false;direction.value='USDC';direction.disabled=!supported;direction.hidden=directionLabel.hidden=!supported;amount.value='';slider.value='0';slider.disabled=true;button.disabled=!supported;
    heading.textContent=supported?t('Comprar SOL','Buy SOL'):symbol+' - '+t('Solo grafico','Chart only');
    for(const element of [balance,amountLabel,amount,slider,sizing,button])element.hidden=!supported;
    availability.textContent=supported?'':t('Este mercado no admite compras aqui. El saldo mostrado en tu cuenta no convierte este activo en un token intercambiable en Solana. Puedes gestionar los tokens compatibles desde Activos; SOL a USDC es una operacion distinta.','Purchases are not supported for this market here. Your account balance does not make this asset a swappable Solana token. Manage supported tokens in Assets; SOL a USDC is a separate operation.');
    amountLabel.textContent=t('Importe en USDC (no USD bancarios)','Amount in USDC (not bank USD)');
    button.textContent=t('Cotizar compra de ','Quote purchase of ')+symbol;
    status.textContent=supported?t('La cotizacion no envia una compra. Revisa y aprueba el intercambio en tu billetera.','A quote does not submit a purchase. Review and approve the swap in your wallet.'):symbol+t(' no esta integrado para swaps aqui. El boton SOL a USDC abre un intercambio distinto, no compra este activo ni lo sustituye por otro token.',' is not integrated for swaps here. The SOL a USDC button opens a separate swap; it does not buy this asset or substitute another token.');
    refreshSizing();
  }};
}

// Ticket presentation only: deliberately no signing or legacy exchange calls.
export function futuresDraftSummary(margin,leverage){
 const m=Number(margin),l=Number(leverage);
 if(!Number.isFinite(m)||m<=0||!Number.isFinite(l)||l<1.1||l>50||!Number.isFinite(m*l))return null;
 return {margin:m,leverage:l,notional:m*l};
}
// The Futures page operates through Phoenix. While false the Jupiter ticket is
// not built at all, so no leftover card can reappear from cache or from CSS.
export const SHOW_JUPITER_TICKET=true;
export function setupFuturesTicket(parent,language,doc,onMarketSelect=()=>{},onWalletSelect=()=>{}){
  if(!SHOW_JUPITER_TICKET){const stub=doc.createElement('div');return {card:stub,selectAsset(){},dispose(){}};}
 let selectedAsset='BTC';
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const card=node('section');card.className='card finance-futures-order';const title=node('h2','BTC - '+t('Futuros','Futures'));
 const picker=node('details');picker.className='futures-market-picker';const toggle=node('summary');toggle.append(title);picker.append(toggle);
 const search=node('input');search.type='search';search.placeholder=t('Buscar mercado...','Search market...');search.setAttribute('aria-label',search.placeholder);picker.append(search);
 // Every market the app can actually trade: the three Jupiter markets plus the
// Phoenix ones. Jupiter keeps its own path; the rest hand off to the Phoenix
// ticket on the same page, which is why the list can show them all here.
const PHOENIX_ONLY=['XRP','LTC','XLM','TRX','BNB','ADA','AVAX','NEAR','SUI','JUP','ZEC','ARB','ZRO','UNI','AAVE','CRV','ONDO','ENA','JTO','RAY','LINK','FET','RENDER','TAO','FIL','WLD','HYPE','VIRTUAL','DOGE','FARTCOIN'];
let markets=[{symbol:'BTC',id:'bitcoin'},{symbol:'ETH',id:'ethereum'},{symbol:'SOL',id:'solana'},...PHOENIX_ONLY.map(symbol=>({symbol,id:symbol.toLowerCase(),venue:'phoenix'}))];
 const choices=node('div');choices.className='futures-market-choices';picker.append(choices);
 function openChartFor(symbol,expand){
  try{
   if(!symbol)return;
   search.value=symbol;filterMarkets();
   const choice=[...choices.children].find(option=>String(option.textContent||'').toUpperCase().startsWith(symbol));
   choice?.click?.();
   const chart=doc.getElementById?.('finance-chart')||doc.querySelector?.('.finance-chart-detail')||doc.querySelector?.('.finance-futures-chart');
   chart?.scrollIntoView?.({behavior:'smooth',block:'start'});
  }catch{}
 }
 doc.addEventListener?.('jamd-chart-market',event=>openChartFor(String(event.detail?.symbol||''),Boolean(event.detail?.expand))); let suggestionTicket=0;
 const loadSuggestion=async symbol=>{
  const ticket=++suggestionTicket;
  suggestion.hidden=true;suggestion.replaceChildren();
  const win=doc.defaultView||globalThis;
  try{
   const url='/api/market-asset?'+new URLSearchParams({symbol,coinId:String(symbol).toLowerCase(),timeframe:'1h'});
   const response=await (win.fetch||fetch)(url,{cache:'no-store'});
   if(!response.ok)return;
   const data=await response.json();
   if(ticket!==suggestionTicket)return;
   const signal=computeTradeSignal(Array.isArray(data.candles)?data.candles:[]);
   if(signal.action==='WAIT'){suggestion.hidden=false;suggestion.append(node('strong',t('Bot: sin entrada clara','Bot: no clear entry')),node('span',signal.reasons.join(' · ')));return;}
   const side=signal.action==='BUY'?'LONG':'SHORT';
   const label=signal.action==='BUY'?t('LONG','LONG'):t('SHORT','SHORT');
   const applyButton=node('button',t('Aplicar y revisar','Apply and review'));applyButton.type='button';
   applyButton.onclick=()=>{try{const state=currentWalletTradingState(doc);const available=BigInt(state?.availableUsdcUnits??state?.snapshot?.availableUsdcUnits??'0');const entered=Number(fields.margin.value||0);if(available>0n&&entered>0&&entered*1e6>Number(available))fields.margin.value=(Number(available)/1e6).toFixed(2);}catch{}const index=side==='LONG'?0:1;const target=buttons[index];if(target)void target.onclick();};
   suggestion.hidden=false;
   suggestion.append(node('strong',t('Sugerencia del bot: ','Bot suggestion: ')+symbol+' '+label),node('span',signal.reasons.join(' · ')+(signal.rsi!==null?' · RSI '+signal.rsi.toFixed(1):'')),applyButton);
  }catch{suggestion.hidden=true;}
 };
 function filterMarkets(){choices.replaceChildren();const needle=search.value.toLowerCase().trim();for(const asset of markets.filter(asset=>(asset.symbol+' '+asset.id).toLowerCase().includes(needle))){const button=node('button',asset.symbol+' / USDC');button.type='button';button.onclick=()=>{picker.open=false;if(asset.venue==='phoenix'){selectedAsset=asset.symbol;void loadSuggestion(asset.symbol);title.textContent=asset.symbol+' - '+t('Futuros','Futures');onMarketSelect(asset);eligibility.textContent=t('Este mercado se opera en Phoenix: el formulario de abajo ya lo tiene seleccionado.','This market trades on Phoenix: the form below already has it selected.');doc.dispatchEvent?.(new CustomEvent('jamd-phoenix-market',{detail:{symbol:asset.symbol}}));doc.getElementById?.('phoenix-futures-markets')?.scrollIntoView?.({block:'center'});return;}onMarketSelect(asset);void loadSuggestion(asset.symbol);};choices.append(button);}}
 search.value='';search.addEventListener('input',filterMarkets);filterMarkets();
 picker.append(node('small',t('Todos los mercados disponibles: BTC, ETH y SOL por Jupiter; el resto en Phoenix.','All available markets: BTC, ETH and SOL through Jupiter; the rest through Phoenix.')));
 const suggestion=node('div');suggestion.className='trade-suggestion';suggestion.hidden=true;card.append(suggestion);
 const walletBalance=node('p');card.append(picker,walletBalance,node('small',t('Saldo consultado, antes de reservas y comisiones.','Observed balance, before reserves and fees.')));
 const eligibility=node('p');eligibility.id='jupiter-ticket-eligibility';eligibility.setAttribute('role','status');card.append(eligibility);
 const fields={},ranges={};for(const[key,label,value,min,max]of [['margin',t('Margen USDC','Margin USDC'),'10','1',null],['leverage',t('Apalancamiento','Leverage'),'3','1.1','50']]){
 const l=node('label',label),input=node('input');input.type='number';input.value=value;input.min=min;input.step='0.1';if(max)input.max=max;input.id='jupiter-ticket-'+key;l.htmlFor=input.id;fields[key]=input;card.append(l,input);
 const rangeLabel=node('label',key==='leverage'?t('Apalancamiento - 3','Leverage - 3'):t('Margen - % de USDC en billetera','Margin - % of wallet USDC'));
 const range=node('input');range.type='range';range.id='jupiter-range-'+key;rangeLabel.htmlFor=range.id;range.className='finance-slider';range.min=key==='margin'?'0':min;range.max=key==='margin'?'100':max;range.step=key==='margin'?'1':'0.1';range.value=key==='margin'?'0':value;range.setAttribute('aria-label',label);card.append(rangeLabel,range);
 ranges[key]=range;
 if(key==='leverage'){range.oninput=()=>{input.value=range.value;rangeLabel.textContent=t('Apalancamiento - ','Leverage - ')+range.value+'';};input.oninput=()=>{range.value=input.value;rangeLabel.textContent=t('Apalancamiento - ','Leverage - ')+input.value+'';};}
 else{range.oninput=()=>{
  const current=currentWalletTradingState(doc),available=current?.availableUsdcUnits??current?.snapshot?.availableUsdcUnits??null;
  const percent=Math.max(0,Math.min(100,Number(range.value)));
  if(!available){rangeLabel.textContent=t('Margen - % de USDC en billetera','Margin - % of wallet USDC')+' - -';return;}
  const units=BigInt(available)*BigInt(Math.round(percent*100))/10000n;
  const whole=units/1000000n,fraction=(units%1000000n).toString().padStart(6,'0');
  input.value=whole.toString()+'.'+fraction;
  input.dispatchEvent?.(new (doc.defaultView?.Event??Event)('input',{bubbles:true}));
  rangeLabel.textContent=t('Margen - ','Margin - ')+percent+'%';
 };bindWalletDisplay(doc,language,walletBalance,range,input);}
 }
 const preview=node('div');preview.className='trade-order-summary';preview.setAttribute('aria-live','polite');
 const update=()=>{const draft=futuresDraftSummary(fields.margin.value,fields.leverage.value);preview.textContent=draft?t('Exposicion indicativa: ','Indicative exposure: ')+draft.notional.toLocaleString(language,{maximumFractionDigits:2})+' USDC - '+t('Margen: ','Margin: ')+draft.margin.toLocaleString(language,{maximumFractionDigits:6})+' USDC - '+draft.leverage+'':t('Revisa margen y apalancamiento.','Check margin and leverage.');};
 for(const field of Object.values(fields))field.addEventListener?.('input',update);
 for(const range of Object.values(ranges))range.addEventListener?.('input',update);
 card.append(preview);update();
 const priceLabel=node('label',t('Precio de referencia USD - limite para revisar','Reference price USD - review limit'));
 const price=node('input');price.type='number';price.step='0.000001';price.min='0.000001';price.id='jupiter-reference-price';priceLabel.htmlFor=price.id;card.append(priceLabel,price);
 const exitFields={};const exits=node('details');exits.append(node('summary',t('TP / SL - precios opcionales','TP / SL - optional prices')));for(const [key,name]of [['stopLoss','SL'],['takeProfit','TP']]){const input=node('input');input.type='number';input.step='0.000001';input.placeholder=name+' USD';input.setAttribute('aria-label',name+' USD');exitFields[key]=input;exits.append(input);}card.append(exits);
 const native=doc.defaultView?.Capacitor?.isNativePlatform?.()&&doc.defaultView?.Capacitor?.getPlatform?.()==='android'&&doc.defaultView?.Capacitor?.isPluginAvailable?.('NativeWallet');
 const status=node('p');status.setAttribute('role','status');
 const capability=node('p');capability.className='futures-signing-status';capability.setAttribute('role','status');
 const chooseWallet=node('button',t('Elegir billetera','Choose wallet'));chooseWallet.type='button';chooseWallet.onclick=()=>onWalletSelect(native?'native':'external');
 const webReview=node('div');webReview.className='trade-order-summary';webReview.hidden=true;webReview.setAttribute('aria-live','polite');
 const readSessionToken=()=>readExistingPerpsControlSession(doc.defaultView||globalThis);
 const policyClient=createManualPerpsPolicyClient({fetchImpl:doc.defaultView?.fetch?.bind(doc.defaultView)||globalThis.fetch,readSessionToken});
 const orderPanel=!native?setupWebPerpsOrderPanel(webReview,{doc,language,policyClient,readSessionToken}):null;
 const botPanel=setupBotManualPerpsPanel(card,{doc,language});
 const buttons=[];
 let revision=0,controller=null,expiry=null,disposed=false;
 const invalidate=()=>{revision++;controller?.abort();controller=null;clearTimeout(expiry);orderPanel?.invalidate();botPanel.invalidate();webReview.hidden=true;status.textContent='';for(const button of buttons)button.disabled=!supported()||disposed;}; // Phoenix markets open from this same card: the venue review renders here.
 const phoenixBox=node('div');phoenixBox.className='trade-order-summary';phoenixBox.hidden=true;phoenixBox.setAttribute('aria-live','polite');card.append(phoenixBox);
 const skipNotice=node('p');skipNotice.className='phoenix-skip-notice';skipNotice.hidden=true;card.append(skipNotice);
 const hasSkipConfirm=()=>{try{return doc.defaultView?.localStorage?.getItem?.('jamd-phoenix-skip-confirm')==='1';}catch{return false;}};
 const refreshSkipNotice=()=>{skipNotice.replaceChildren();if(!hasSkipConfirm()){skipNotice.hidden=true;return;}skipNotice.hidden=false;const text=node('span',t('Aviso de confirmacion desactivado. ','Confirmation prompt disabled. '));const restore=node('button',t('Reactivar','Re-enable'));restore.type='button';restore.onclick=()=>{try{doc.defaultView?.localStorage?.removeItem?.('jamd-phoenix-skip-confirm');}catch{}refreshSkipNotice();};skipNotice.append(text,restore);};
 let phoenixAnimationIndex=-1;
 const showError=(message,title)=>{
  try{
   const dialog=node('dialog');dialog.className='trade-share-dialog phoenix-confirm';
   dialog.classList?.add(['share-in-pop','share-in-slide','share-in-flip','share-in-zoom'][(phoenixAnimationIndex=(phoenixAnimationIndex+1)%4)]);
   dialog.append(node('h3',title||t('No se pudo completar','Could not complete')));
   const body=node('div');body.className='phoenix-error';body.textContent=String(message);dialog.append(body);
   const actions=node('div');actions.className='wt-position-actions';
   const close=node('button',t('Entendido','Got it'));close.type='button';close.onclick=()=>{dialog.classList?.add('share-out');setTimeout(()=>{dialog.close?.();dialog.remove?.();},170);};
   actions.append(close);dialog.append(actions);
   if(doc.body?.append)doc.body.append(dialog);else card.append(dialog);
   if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
  }catch{status.textContent=String(message);}};
 refreshSkipNotice();
 const phoenixClient=createPhoenixManualClient({fetchImpl:doc.defaultView?.fetch?.bind(doc.defaultView)||globalThis.fetch,readSessionToken:()=>readExistingPerpsControlSession(doc.defaultView||globalThis)});
 // The venue publishes its full catalog, so the picker can offer every market
 // it actually trades instead of a hand-written subset.
 void (async()=>{try{const wallet=selectedWalletAccount(doc)?.address;if(!wallet)return;const data=await phoenixClient.markets(wallet);const symbols=[...new Set(data.markets.filter(m=>m.active!==false).map(m=>m.symbol))];if(symbols.length<=markets.length)return;markets=symbols.map(symbol=>({symbol,id:symbol.toLowerCase(),venue:'phoenix'}));filterMarkets();}catch{}})();
 const unitsOf=text=>{const value=String(text??'').trim().replace(',','.');if(!/^\d+(\.\d{1,6})?$/.test(value))return null;const [whole,fraction='']=value.split('.');const units=BigInt(whole)*1000000n+BigInt((fraction+'000000').slice(0,6));return units>0n?units.toString():null;};
 const showPhoenixReview=(review,side,selected)=>{
  const skipKey='jamd-phoenix-skip-confirm';
  let skip=false;try{skip=doc.defaultView?.localStorage?.getItem?.(skipKey)==='1';}catch{}
  const send=async()=>{
   status.textContent=t('Enviando...','Sending...');
   try{
    await phoenixClient.confirmEntry(review,true);
    status.textContent=t('Orden enviada. Confirmando en cadena...','Order sent. Confirming on chain...');
    for(let i=0;i<30;i++){
     const current=await phoenixClient.recoverEntry(selected.address,review.workflowId);
     if(current.state==='OPEN'){status.textContent='Phoenix - '+current.state;try{doc.dispatchEvent(new (doc.defaultView?.CustomEvent??Event)('jamd-phoenix-changed',{detail:{symbol:review.symbol}}));}catch{}break;}
     await new Promise(resolve=>setTimeout(resolve,2000));
    }
   }catch(error){showError(t('No se confirmo: ','Not confirmed: ')+String(error?.message||error),t('No se confirmo','Not confirmed'));}
  };
  if(skip){void send();return;}
  const dialog=node('dialog');dialog.className='trade-share-dialog phoenix-confirm';
  const heading=node('h3',t('Confirmar ','Confirm ')+review.symbol+' '+side);
  const add=(label,value)=>{const row=node('p');row.append(node('span',label),node('strong',String(value)));dialog.append(row);};
  dialog.append(heading);
  if(review.referencePriceUsd)add(t('Precio de referencia','Reference price'),review.referencePriceUsd);
  if(review.priceLimitUsd)add(t('Precio limite','Limit price'),review.priceLimitUsd);
  if(review.platformFeeUsdcUnits)add(t('Comision de plataforma','Platform fee'),(Number(review.platformFeeUsdcUnits)/1e6).toFixed(2)+' USDC');
  if(review.maximumFeeNetworkLamports)add(t('Coste de red maximo','Maximum network cost'),(Number(review.maximumFeeNetworkLamports)/1e9).toFixed(6)+' SOL');
  const skipLabel=node('label'),skipCheck=node('input');skipCheck.type='checkbox';skipLabel.append(skipCheck,node('span',' '+t('No volver a preguntar','Do not ask again')));
  const row=node('div');row.className='wt-position-actions';
  const accept=node('button',t('Aceptar','Accept'));accept.type='button';
  const cancel=node('button',t('Cancelar','Cancel'));cancel.type='button';
  accept.onclick=()=>{if(skipCheck.checked){try{doc.defaultView?.localStorage?.setItem?.(skipKey,'1');}catch{}}refreshSkipNotice();dialog.classList?.add('share-out');setTimeout(()=>{dialog.close?.();dialog.remove?.();},170);refreshSkipNotice();void send();};
  cancel.onclick=()=>{dialog.classList?.add('share-out');setTimeout(()=>{dialog.close?.();dialog.remove?.();},170);status.textContent='';};
  row.append(accept,cancel);dialog.append(skipLabel,row);
  if(doc.body?.append)doc.body.append(dialog);else card.append(dialog);
  if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
 };
 const openPhoenix=async(side,selected)=>{
  const marginUsdcUnits=unitsOf(fields.margin.value),leverageTenths=Math.round(Number(String(fields.leverage.value).replace(',','.'))*10);
  if(!marginUsdcUnits||!(leverageTenths>=11&&leverageTenths<=500)){status.textContent=t('Margen y apalancamiento no validos.','Invalid margin or leverage.');return;}
  for(const button of buttons)button.disabled=true;
  status.textContent=t('Preparando la entrada...','Preparing the entry...');
  try{
   let review;
   try{review=await phoenixClient.prepareEntry(selected.address,{symbol:selectedAsset,side,marginUsdcUnits,leverageTenths});}
   catch(error){
    const code=String(error?.message||error);
    if(!/^(PHOENIX_|phoenix-)/.test(code))throw error;
    if(/no-transaction|already settled|nothing to do/i.test(code)){review=await phoenixClient.prepareEntry(selected.address,{symbol:selectedAsset,side,marginUsdcUnits,leverageTenths});}
    else{
    status.textContent=t('Preparando tu cuenta de Phoenix...','Preparing your Phoenix account...');
    try{await phoenixClient.setupAccount(selected.address,{symbol:selectedAsset,side,marginUsdcUnits,leverageTenths},true);}catch(setupError){const setupCode=String(setupError?.message||setupError);if(!/no-transaction|already/i.test(setupCode))throw setupError;}
    review=await phoenixClient.prepareEntry(selected.address,{symbol:selectedAsset,side,marginUsdcUnits,leverageTenths});}
   }
   status.textContent='';showPhoenixReview(review,side,selected);
  }catch(error){const raw=String(error?.message||error);const short=raw.includes('insufficient-usdc')?t('Saldo insuficiente para ese margen: el venue pide 10 USDC minimo mas comisiones. Baja el margen al disponible o deposita mas.','Not enough balance for that margin: the venue asks for 10 USDC minimum plus fees. Lower the margin to what you have or deposit more.'):null;const friendly=short??(raw.includes('MINIMUM_COLLATERAL')?t('Phoenix exige un colateral minimo por posicion. Sube el margen (10 USDC suele bastar) o elige otro mercado.','Phoenix requires a minimum collateral per position. Raise the margin (10 USDC usually works) or pick another market.'):raw.includes('SIZE_TIER')?t('Ese mercado exige un tamano minimo mayor: sube el margen o el apalancamiento.','That market needs a bigger size: raise the margin or the leverage.'):t('No se pudo revisar la entrada. Codigo: ','Could not review the entry. Code: ')+raw);showError(friendly,t('No se pudo revisar','Could not review'));}
  finally{for(const button of buttons)button.disabled=!supported()||disposed;}
 };
 const supported=()=>markets.some(asset=>asset.symbol===selectedAsset);
 function displayCapability(){
  const account=selectedWalletAccount(doc),session=readWebPerpsWalletSession(doc);
  eligibility.textContent=supported()?t('Nuevas posiciones: minimo 10 USDC de margen, ademas de comisiones. Tener 5 USDC no permite abrir futuros; el swap SOL a USDC es independiente.','New positions require at least 10 USDC collateral, plus fees. A 5 USDC balance cannot open futures; SOL a USDC swaps are separate.'):selectedAsset+t(' solo muestra datos de mercado. Jupiter Perps permite operar BTC, ETH y SOL; elige uno desde la flecha del mercado.',' displays market data only. Jupiter Perps trades BTC, ETH and SOL; choose one using the market arrow.');
  capability.textContent=native?t('Revision y firma en tu billetera JamdDmaj. Cada orden requiere tu aprobacion.','Review and sign in your JamdDmaj wallet. Each order requires your approval.'):
   account?.source==='watch'?t('El servidor verificara si esta es tu billetera exclusiva del bot. Para una orden manual, el bot debe estar pausado y debes confirmar limites manuales, revision y comision. Una direccion vinculada por si sola no autoriza firmas.','The server will verify whether this is your exclusive bot wallet. A manual order requires a paused bot, confirmed manual limits, review and fee approval. Linking an address alone does not authorize signing.'):
   account?.source==='external'?t('Billetera seleccionada: ','Selected wallet: ')+account.name+' - '+(session?t('Conectada para aprobacion en Phantom. Antes de firmar se comprobaran disponibilidad del servidor y limites manuales.','Connected for Phantom approval. Server availability and manual limits are checked before signing.'):
    t('Direccion solo para consulta. Reconecta tu billetera para aprobar ordenes; una direccion guardada no permite firmar.','Read-only address. Reconnect your wallet to approve orders; a saved address cannot sign.')):
   t('Selecciona una billetera Solana. Cada orden requiere una sesion de Google, limites manuales y aprobacion en tu billetera.','Select a Solana wallet. Every order requires a Google session, manual limits and wallet approval.');
  if(native&&account?.source!=='native')capability.textContent=t('El saldo mostrado no autoriza firmas. Pulsa Elegir/Cambiar billetera y selecciona tu billetera nativa JamdDmaj para revisar una orden.','The displayed balance does not authorize signing. Use Choose/Change wallet and select your native JamdDmaj wallet to review an order.');
  chooseWallet.textContent=account?t('Cambiar billetera','Change wallet'):t('Conectar billetera','Connect wallet');
  for(const button of buttons)button.disabled=!supported()||disposed;
 }
 const walletChanged=()=>{invalidate();displayCapability();};
 doc.addEventListener?.('jamd-wallet-portfolio',walletChanged);
 doc.addEventListener?.('jamd-web-wallet-session',walletChanged);
 for(const input of [...Object.values(fields),...Object.values(ranges),price,...Object.values(exitFields)])input.addEventListener?.('input',invalidate);
 let recovery;
 let policyPanel;
 const dispose=()=>{disposed=true;invalidate();botPanel.dispose();orderPanel?.dispose();policyPanel?.dispose();recovery?.dispose();doc.removeEventListener?.('jamd-wallet-portfolio',walletChanged);doc.removeEventListener?.('jamd-web-wallet-session',walletChanged);};
 doc.defaultView?.addEventListener?.('pagehide',dispose,{once:true});
 const actions=node('div');actions.className='actions';for(const[side,label,cls]of [['LONG',t('Abrir Long','Open Long'),'buy'],['SHORT',t('Abrir Short','Open Short'),'sell']]){
  const button=node('button',native?label:(side==='LONG'?t('Revisar Long','Review Long'):t('Revisar Short','Review Short')));button.type='button';button.className=cls;buttons.push(button);
  button.onclick=async()=>{
   if(disposed)return;
   const venueMarket=markets.find(asset=>asset.symbol===selectedAsset);
   if(!venueMarket){status.textContent=t('Elige un mercado.','Choose a market.');return;}
   invalidate();const selected=selectedWalletAccount(doc);
   if(!selected||native&&!['native','watch'].includes(selected.source)||!native&&!['external','watch'].includes(selected.source)){
    status.textContent=native?t('Selecciona tu billetera JamdDmaj en Activos. Esta entrada no firma con Phantom.','Select your JamdDmaj wallet in Assets. This entry cannot sign with Phantom.'):t('Conecta o selecciona tu billetera Solana en Activos. Recordar una direccion no concede permiso para operar.','Connect or select your Solana wallet in Assets. Remembering an address does not grant permission to trade.');onWalletSelect(native?'native':'external');return;
   }
   if(selected.source==='watch'){
    // One venue for every market: the bot wallet always trades on Phoenix, so
    // the same margin floor and review apply to BTC, ETH and SOL as well.
    await openPhoenix(side,selected);return;
    const ticket=revision,asset=selectedAsset;for(const b of buttons)b.disabled=true;
    status.textContent=t('Consultando precio de referencia...','Reading reference price...');
    try{
     const reference=await readPerpsMarketReference(asset,{fetchImpl:doc.defaultView?.fetch?.bind(doc.defaultView)||globalThis.fetch});
     if(disposed||ticket!==revision||selectedWalletAccount(doc)?.address!==selected.address)return;
     price.value=reference;status.textContent='';
    }catch{if(!disposed&&ticket===revision)status.textContent=t('No se pudo consultar un precio reciente. No se preparo ni envio ninguna orden.','A fresh price could not be retrieved. No order was prepared or submitted.');return;}
    finally{if(!disposed&&ticket===revision)displayCapability();}
   }
   let draft;
   try{
    draft=perpsNavigationDraft({asset:selectedAsset,side,margin:fields.margin.value.trim(),leverage:fields.leverage.value.trim(),referencePrice:price.value.trim(),stopLoss:exitFields.stopLoss.value.trim(),takeProfit:exitFields.takeProfit.value.trim()});
   }catch(error){
    const messages={
     margin:t('Introduce un margen minimo de 10 USDC, con hasta 6 decimales.','Enter a margin of at least 10 USDC, with up to 6 decimal places.'),
     referencePrice:t('Introduce el precio de referencia del activo seleccionado. Es obligatorio para comprobar la proteccion de precio.','Enter the reference price of the selected asset. It is required to check price protection.'),
     leverage:t('Introduce un apalancamiento entre 1,1 y 50, con hasta un decimal.','Enter leverage between 1.1 and 50, with up to one decimal place.'),
     exit:t('Revisa TP/SL: en Long, SL menor y TP mayor al precio; en Short, al contrario. Puedes dejarlos vacios.','Check TP/SL: for Long, SL below and TP above the price; for Short, the reverse. Both may be left blank.')
    };
    status.textContent=(messages[error?.message]||t('Revisa el mercado y los campos de la orden.','Check the market and order fields.'))+' '+t('No se envio ninguna orden.','No order was sent.');return;
   }
   if(selected.source==='watch'){
    for(const b of buttons)b.disabled=true;const ticket=revision;
    try{
     if(!await policyPanel.ensureForReview()){if(!disposed&&ticket===revision)status.textContent=t('Configura tu proteccion de cuenta una sola vez abajo. Despues pulsa Long o Short; tus limites quedan guardados.','Set your account protection once below. Then press Long or Short; your limits stay saved.');return;}
     if(!disposed&&ticket===revision)await botPanel.prepare(draft);
    }finally{if(!disposed)displayCapability();}
    return;
   }
   if(!native){
    webReview.hidden=false;for(const b of buttons)b.disabled=true;
    try{await orderPanel.prepare(draft);}finally{if(!disposed)displayCapability();}
    return;
   }
   try{
    const EventType=doc.defaultView?.CustomEvent||globalThis.CustomEvent;if(!EventType)throw Error('navigation');
    doc.dispatchEvent(new EventType('jamd-wallet-open-perps',{detail:draft}));
    status.textContent=t('Revisa la orden en la pantalla segura y confirma con huella solo si aceptas. Abrirla no firma ni envia.','Review the order on the secure screen and confirm with biometrics only if you accept. Opening it does not sign or send.');
   }catch{status.textContent=t('Revisa margen minimo 10 USDC, apalancamiento, precio y TP/SL. No se envio ninguna orden.','Check minimum 10 USDC margin, leverage, price and TP/SL. No order was sent.');}
  };actions.append(button);
 }
 card.append(capability,chooseWallet,actions,webReview,status);parent.append(card);displayCapability();
 policyPanel=setupManualPerpsPolicyPanel(card,{doc,client:policyClient,language});
 if(!native){recovery=setupWebPerpsRecovery(card,language,doc);}
 return {dispose,selectAsset(asset){invalidate();selectedAsset=String(asset.symbol||'');title.textContent=selectedAsset+' - '+t('Futuros','Futures');price.value='';for(const input of Object.values(exitFields))input.value='';displayCapability();}};
}
