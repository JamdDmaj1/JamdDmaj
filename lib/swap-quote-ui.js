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
  card.className+=' finance-inline-buy';
  card.append(heading,
    node('p', t('Consulta inicial SOL/USDC. Solo cotización orientativa: no incluye una garantía de precio ni habilita compras. Tus fondos no se mueven.', 'Initial SOL/USDC lookup. Indicative quote only: no guaranteed price or buying enabled. Your funds do not move.')));
  const direction = node('select');
  for (const value of ['SOL', 'USDC']) { const option = node('option', value === 'SOL' ? 'SOL → USDC' : 'USDC → SOL'); option.value = value; direction.append(option); }
  direction.value = 'SOL'; direction.id = 'swap-direction';
  const directionLabel = node('label', t('Entregas → recibes', 'Pay → receive')); directionLabel.htmlFor = direction.id;
  const amount = node('input'); amount.id = 'swap-amount'; amount.inputMode = 'decimal'; amount.autocomplete = 'off';
  const amountLabel = node('label', t('Cantidad que entregas', 'Amount you pay')); amountLabel.htmlFor = amount.id;
  const button = node('button', t('Consultar cotización', 'Get quote')); button.type = 'button';
  const status = node('p');status.id='swap-status'; status.setAttribute('role', 'status');
  const balance=node('p',t('Saldo disponible · USDC: — (billetera sin consultar)','Available balance · USDC: — (wallet not checked)'));
  const slider=node('input');slider.type='range';slider.min='0';slider.max='100';slider.value='0';slider.disabled=true;slider.setAttribute('aria-label',t('Porcentaje del saldo disponible','Percentage of available balance'));
  card.append(balance,directionLabel, direction, amountLabel, amount,slider, button, status); parent.append(card);
  let supported=true;
  let revision = 0, timer;
  function clear() { revision++; clearTimeout(timer); status.textContent = ''; button.disabled = !supported; }
  amount.addEventListener('input', clear); direction.addEventListener('change', clear);
  button.onclick = async () => {
    if(!supported)return;
    clear(); const ticket = revision;
    const input = TOKENS[direction.value], output = TOKENS[direction.value === 'SOL' ? 'USDC' : 'SOL'];
    let units;
    try { units = exactSwapUnits(amount.value.trim(), input.decimals); }
    catch { status.textContent = t('Introduce una cantidad válida, sin redondear decimales.', 'Enter a valid amount without rounding decimals.'); return; }
    button.disabled = true; status.textContent = t('Consultando…', 'Loading…');
    try {
      const base = globalThis.Capacitor?.isNativePlatform?.() ? 'https://www.jamddmaj.com' : '';
      const response = await fetch(base + '/api/swap-quote?' + new URLSearchParams({ inputMint: input.mint, outputMint: output.mint, amount: units }), { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('unavailable');
      const { quote } = await response.json();
      if (ticket !== revision) return;
      if (quote?.executable !== false || quote.inputMint !== input.mint || quote.outputMint !== output.mint || quote.inAmount !== units || !/^[1-9]\d{0,19}$/.test(quote.outAmount) || !Number.isFinite(quote.expiresAt) || quote.expiresAt <= Date.now() || quote.expiresAt > Date.now() + 15000) throw new Error('invalid');
      const digits = quote.outAmount.padStart(output.decimals + 1, '0');
      const displayed = digits.slice(0, -output.decimals) + '.' + digits.slice(-output.decimals);
      status.textContent = t('Salida estimada: ', 'Estimated output: ') + displayed + (direction.value === 'SOL' ? ' USDC' : ' SOL') + t(' · No es una orden.', ' · Not an order.');
      timer = setTimeout(() => { if (ticket === revision) status.textContent = t('Cotización vencida. Consulta de nuevo.', 'Quote expired. Request again.'); }, quote.expiresAt - Date.now());
    } catch { if (ticket === revision) status.textContent = t('Cotización no disponible. No se ha enviado ninguna operación.', 'Quote unavailable. No transaction was submitted.'); }
    finally { if (ticket === revision) button.disabled = !supported; }
  };
  return {card,selectAsset(asset){
    clear();const symbol=String(asset.symbol||'');heading.textContent=t('Comprar ','Buy ')+symbol;
    supported=symbol==='SOL';direction.value='USDC';direction.disabled=true;amount.value='';button.disabled=!supported;
    amountLabel.textContent=t('Importe en USDC (no USD bancarios)','Amount in USDC (not bank USD)');
    button.textContent=t('Cotizar compra de ','Quote purchase of ')+symbol;
    status.textContent=supported?t('La cotización no envía una compra. Firma de billetera pendiente.','A quote does not submit a purchase. Wallet signing pending.'):t('Este activo no está integrado para swaps en Solana. BTC nativo no es un token de Solana; no se sustituirá por otro token sin identificar su red y contrato.','This asset is not integrated for Solana swaps. Native BTC is not a Solana token; no substitute token is used without identifying its network and mint.');
  }};
}

// Ticket presentation only: deliberately no signing or legacy exchange calls.
export function setupFuturesTicket(parent,language,doc){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const card=node('section');card.className='card finance-futures-order';const title=node('h2','BTC · '+t('Futuros','Futures'));
 card.append(title,node('p',t('Disponible · USDC: —','Available · USDC: —')));
 const fields={};for(const[key,label,value,min,max]of [['margin',t('Margen USDC','Margin USDC'),'10','10',null],['leverage',t('Apalancamiento','Leverage'),'3','1.1','50']]){
 const l=node('label',label),input=node('input');input.type='number';input.value=value;input.min=min;input.step='0.1';if(max)input.max=max;input.id='jupiter-ticket-'+key;l.htmlFor=input.id;fields[key]=input;card.append(l,input);
 if(key==='leverage'){const range=node('input');range.type='range';range.min=min;range.max=max;range.step='0.1';range.value=value;range.className='finance-slider';range.setAttribute('aria-label',label);range.oninput=()=>{input.value=range.value;};input.oninput=()=>{range.value=input.value;};card.append(range);}
 }
 const exits=node('details');exits.append(node('summary',t('TP / SL · opcional','TP / SL · optional')));for(const name of ['SL','TP']){const input=node('input');input.type='number';input.placeholder=name+' %';input.setAttribute('aria-label',name+' %');exits.append(input);}card.append(exits);
 const actions=node('div');actions.className='actions';for(const[side,label,cls]of [['LONG',t('Abrir Long','Open Long'),'buy'],['SHORT',t('Abrir Short','Open Short'),'sell']]){const button=node('button',label);button.type='button';button.className=cls;button.disabled=true;button.title=t('Ejecución Jupiter pendiente','Jupiter execution pending');actions.append(button);}card.append(actions,node('p',t('Ejecución Jupiter pendiente de integrar. No se usa Bitget ni se envían órdenes desde este formulario.','Jupiter execution integration pending. This form does not use Bitget or submit orders.')));parent.append(card);
 return {selectAsset(asset){title.textContent=asset.symbol+' · '+t('Futuros','Futures');}};
}
