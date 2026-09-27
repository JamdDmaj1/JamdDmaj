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
  card.append(node('h2', t('Intercambiar · Solana', 'Swap · Solana')),
    node('p', t('Consulta inicial SOL/USDC. Solo cotización orientativa: no incluye una garantía de precio ni habilita compras. Tus fondos no se mueven.', 'Initial SOL/USDC lookup. Indicative quote only: no guaranteed price or buying enabled. Your funds do not move.')));
  const direction = node('select');
  for (const value of ['SOL', 'USDC']) { const option = node('option', value === 'SOL' ? 'SOL → USDC' : 'USDC → SOL'); option.value = value; direction.append(option); }
  direction.value = 'SOL'; direction.id = 'swap-direction';
  const directionLabel = node('label', t('Entregas → recibes', 'Pay → receive')); directionLabel.htmlFor = direction.id;
  const amount = node('input'); amount.id = 'swap-amount'; amount.inputMode = 'decimal'; amount.autocomplete = 'off';
  const amountLabel = node('label', t('Cantidad que entregas', 'Amount you pay')); amountLabel.htmlFor = amount.id;
  const button = node('button', t('Consultar cotización', 'Get quote')); button.type = 'button';
  const status = node('p'); status.setAttribute('role', 'status');
  card.append(directionLabel, direction, amountLabel, amount, button, status); parent.append(card);
  let revision = 0, timer;
  function clear() { revision++; clearTimeout(timer); status.textContent = ''; button.disabled = false; }
  amount.addEventListener('input', clear); direction.addEventListener('change', clear);
  button.onclick = async () => {
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
    finally { if (ticket === revision) button.disabled = false; }
  };
}
