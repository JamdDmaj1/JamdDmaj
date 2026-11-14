// Fase 1: catálogo de perpetuos de Hyperliquid en modo solo lectura.
const ENDPOINT = 'https://api.hyperliquid.xyz/info';

export function setupHyperliquidFuturesPanel(parent, { doc = document, language = 'es' } = {}) {
  const t = (es, en) => (language === 'es' ? es : en);
  const node = (tag, text) => { const el = doc.createElement(tag); if (text !== undefined) el.textContent = text; return el; };
  const card = node('section'); card.className = 'card hl-futures';
  const head = node('div'); head.className = 'hl-head';
  const title = node('h2', t('Futuros Hyperliquid', 'Hyperliquid futures'));
  const badge = node('span', t('Solo lectura', 'Read only')); badge.className = 'hl-badge';
  head.append(title, badge);
  const note = node('p', t('Datos públicos del venue. El trading se conectará en la siguiente fase; aquí no se firma nada.', 'Public venue data. Trading connects in the next phase; nothing is signed here.'));
  note.className = 'hl-note';
  const search = node('input'); search.type = 'search'; search.placeholder = t('Buscar mercado…', 'Search market…'); search.className = 'hl-search';
  search.setAttribute('aria-label', t('Buscar mercado de Hyperliquid', 'Search Hyperliquid market'));
  const status = node('p'); status.className = 'hl-status'; status.textContent = t('Cargando mercados…', 'Loading markets…');
  const list = node('div'); list.className = 'hl-list';
  card.append(head, note, search, status, list); parent.append(card);

  let markets = [], disposed = false;

  const render = () => {
    if (disposed) return;
    const query = search.value.trim().toUpperCase();
    const rows = markets.filter(m => !query || m.name.includes(query)).slice(0, 40);
    list.replaceChildren();
    if (!rows.length) { list.append(node('p', t('Sin mercados que coincidan.', 'No matching markets.'))); return; }
    for (const m of rows) {
      const row = node('div'); row.className = 'hl-row';
      row.append(node('strong', m.name));
      row.append(node('span', m.mark.toLocaleString(language, { maximumFractionDigits: m.mark >= 100 ? 2 : 6 })));
      const volume = node('small', t('24h ', '24h ') + (m.volume >= 1e9 ? (m.volume / 1e9).toFixed(1) + 'B' : m.volume >= 1e6 ? (m.volume / 1e6).toFixed(1) + 'M' : Math.round(m.volume).toLocaleString(language)));
      const funding = node('small', t('funding ', 'funding ') + (m.funding * 100).toFixed(4) + '%');
      funding.className = m.funding < 0 ? 'hl-funding neg' : 'hl-funding pos';
      row.append(volume, funding);
      list.append(row);
    }
  };

  const load = async () => {
    try {
      const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'metaAndAssetCtxs' }), signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw Error('hl-' + response.status);
      const raw = await response.json();
      const universe = raw?.[0]?.universe, contexts = raw?.[1];
      if (!Array.isArray(universe) || !Array.isArray(contexts)) throw Error('hl-shape');
      markets = universe.map((item, index) => {
        const context = contexts[index] || {};
        const mark = Number(context.markPx ?? context.oraclePx ?? 0);
        return { name: String(item.name || '').toUpperCase(), mark: Number.isFinite(mark) ? mark : 0, volume: Number(context.dayNtlVlm || 0) || 0, funding: Number(context.funding || 0) || 0 };
      }).filter(item => item.name && item.mark > 0).sort((a, b) => b.volume - a.volume);
      status.textContent = t(markets.length + ' mercados · ordenados por volumen 24h', markets.length + ' markets · sorted by 24h volume');
      render();
    } catch (error) {
      status.textContent = t('No se pudieron cargar los mercados de Hyperliquid. Se reintentará.', 'Hyperliquid markets could not be loaded. It will retry.');
      setTimeout(() => { if (!disposed) void load(); }, 20000);
    }
  };

  search.oninput = render;
  void load();

  return () => { disposed = true; card.remove(); };
}
