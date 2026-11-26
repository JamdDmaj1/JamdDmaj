(() => {
  // The JamdDmaj app and public web are English-only.
  const language = "en";
  document.documentElement.lang = "en";
  const exact = new Map([
    ["Tokens nuevos bajo lupa", "New tokens under the radar"],
    ["Volver", "Back"],
    ["Disponible", "Available"],
    ["En tokens", "In tokens"],
    ["Sin wallet", "No wallet"],
    ["Cambiar", "Change"],
    ["Mostrar", "Show"],
    ["Ocultar", "Hide"],
    ["Conectar wallet", "Connect wallet"],
    ["Analizar ahora", "Analyze now"],
    ["Minimo de seguridad", "Minimum safety"],
    ["Todos", "All"],
    ["Medio o mejor", "Medium or better"],
    ["Mejor perfil", "Best profile"],
    ["Ocultar alto riesgo", "Hide high risk"],
    ["Buscar simbolo", "Search symbol"],
    ["Compra rapida USD", "Quick buy USD"],
    ["Cargando tokens nuevos...", "Loading new tokens..."],
    ["Nuevos", "New"],
    ["Trending", "Trending"],
    ["Confiables", "Trusted"],
    ["Alto riesgo", "High risk"],
    ["Favoritos", "Favorites"],
    ["Mis tokens", "My tokens"],
    ["Historial", "History"],
    ["Mayor volumen", "Highest volume"],
    ["Mayor market cap", "Highest market cap"],
    ["Sin categoria", "No category"],
    ["sin dato", "no data"],
    ["Sin dato", "No data"],
    ["Ver token", "View token"],
    ["Copiar contrato", "Copy contract"],
    ["Copiado", "Copied"],
    ["No disponible", "Unavailable"],
    ["Analizando tokens...", "Analyzing tokens..."],
    ["Analizando tokens nuevos...", "Analyzing new tokens..."],
    ["Sin operaciones recientes detectadas.", "No recent trades detected."],
    ["ATH mcap", "ATH mcap"],
    ["reintentar", "retry"],
    ["Vigilar", "Watch"],
    ["Vigilando", "Watching"],
    ["Radar en vivo", "Live radar"],
    ["Precio", "Price"],
    ["Cantidad", "Amount"],
    ["Valor", "Value"],
    ["Del total", "Of total"],
    ["Market cap", "Market cap"],
    ["Grafico", "Chart"],
    ["Contrato", "Contract"],
    ["Seguridad", "Safety"],
    ["Liquidez", "Liquidity"],
    ["Holders", "Holders"],
    ["Riesgo", "Risk"],
    ["Comprar", "Buy"],
    ["Vender", "Sell"],
    ["Conecta tu wallet para verlo", "Connect your wallet to view it"],
    ["Pulsa \"Vigilar\" en un token para seguirlo en vivo.", "Tap \"Watch\" on a token to track it live."],
    ["Activar notificaciones", "Enable notifications"],
    ["Nube: sin conexion", "Cloud: offline"],
    ["Aviso:", "Notice:"],
    ["Fuentes:", "Sources:"],
    ["Potencial BAJO", "LOW potential"],
    ["Potencial MEDIO", "MEDIUM potential"],
    ["Potencial ALTO", "HIGH potential"],
    ["seguridad - 100 es mejor?", "safety - 100 is best?"],
    ["potencial estimado?", "estimated potential?"],
    ["Emision revocada", "Mint revoked"],
    ["Nadie puede acunar mas", "No one can mint more"],
    ["Congelacion revocada", "Freeze revoked"],
    ["No pueden congelar saldos", "Cannot freeze balances"],
    ["Liquidez bloqueada", "Liquidity locked"],
    ["Concentracion de holders", "Holder concentration"],
    ["Rotacion (volumen/liquidez)", "Turnover (volume/liquidity)"],
    ["Profundidad de liquidez", "Liquidity depth"],
    ["LP bloqueado 100%", "LP locked 100%"],
    ["MEJOR PERFIL", "BEST PROFILE"],
    ["PRUDENCIA", "CAUTION"],
    ["RIESGO", "RISK"],
    ["PELIGRO", "DANGER"],
    ["Historial del creador limpio", "Clean creator history"],
    ["LOW potential", "Low potential"],
    ["Antiguedad", "Age"],
    ["Sin carteras insider", "No insider wallets"],
    ["No se detectan carteras insider", "No insider wallets detected"],
    ["Sin historial de rug conocido", "No known rug history"],
    ["Impulso de precio", "Price momentum"],
    ["Presion compradora", "Buy pressure"],
    ["Presion vendedora", "Sell pressure"],
    ["Retirada de liquidez:", "Liquidity withdrawal:"],
    ["MEDIO", "MEDIUM"],
    ["BAJO", "LOW"],
    ["ALTO", "HIGH"]
  ]);
  const patterns = [
    [/\bSin wallet\b/g, "No wallet"],
    [/\bConectar wallet\b/g, "Connect wallet"],
    [/\bNo se pudo comprar:\s*/g, "Could not buy: "],
    [/\bNo se pudo vender:\s*/g, "Could not sell: "],
    [/\bNo se pudo analizar ahora:\s*/g, "Could not analyze now: "],
    [/\bNo se pudo analizar el movimiento:\s*/g, "Could not analyze the move: "],
    [/\bNo se pudo auditar:\s*/g, "Could not audit: "],
    [/\bSin ruta ahora mismo:\s*/g, "No route right now: "],
    [/\bPhantom no esta disponible aqui\.?/g, "Phantom is not available here."],
    [/\bNo tienes este token en la wallet conectada\.?/g, "You do not hold this token in the connected wallet."],
    [/\bEsta wallet no tiene tokens con precio en este momento\.?/g, "This wallet has no priced tokens right now."],
    [/\bConecta Phantom o indica una direccion en la barra de saldo para ver tus tokens reales\.?/g, "Connect Phantom or enter an address in the balance bar to see your real tokens."],
    [/\bEsa direccion no parece valida\.?/g, "That address does not look valid."],
    [/\bNo se pudo conectar:\s*/g, "Could not connect: "],
    [/\bEl modulo de compartir todavia no esta cargado\.?/g, "The share module is not loaded yet."],
    [/\bNo hay posiciones abiertas\.?/g, "No open positions."],
    [/\bNingun token cumple esos filtros ahora mismo\.?/g, "No token matches those filters right now."],
    [/\bNingun token alcanza 75 de seguridad ahora mismo\.?/g, "No token reaches a safety score of 75 right now."],
    [/\bNingun token con riesgo alto en esta muestra\.?/g, "No high-risk token in this sample."],
    [/\bSin resultados\.?/g, "No results."],
    [/\bAun no has guardado favoritos: pulsa la estrella en un token\.?/g, "You have not saved favorites yet: tap the star on a token."],
    [/\bNo se pudo cargar\.?/g, "Could not load."],
    [/\bToken nuevo en la lista:\s*/g, "New token in the list: "],
    [/\bBallena compro\b/g, "Whale bought"],
    [/\bBallena vendio\b/g, "Whale sold"],
    [/\bSin senales publicas de scam en el analizador ni en sus votos\.?/g, "No public scam signals in the analyzer or its votes."],
    [/\bAnalisis automatico de datos publicos:.*$/g, "Automated analysis of public data: mint and freeze authority, locked liquidity, holder concentration, real liquidity and market risk signals."],
    [/\besta herramienta no garantiza que un token sea seguro ni rentable\..*$/g, "this tool does not guarantee that a token is safe or profitable. X account verification requires a paid external API; only public links are shown so you can review them yourself."],
    [/\bGeckoTerminal \(pools nuevos\), RugCheck \(autoridades, holders, LP\) y DexScreener \(redes\)\./g, "GeckoTerminal (new pools), RugCheck (authorities, holders, LP) and DexScreener (networks)."],
    [/\bPulsa \"Vigilar\" en un token para seguirlo en vivo\./g, "Tap \"Watch\" on a token to track it live."],
    [/\bNube: sin conexion\b/g, "Cloud: offline"],
    [/\bConecta tu wallet para verlo\b/g, "Connect your wallet to view it"],
     [/\bFuentes:\s*/g, "Sources: "],
    [/\b(\d+) token\(es\) analizados de (\d+)\./g, "$1 tokens analyzed out of $2."],
    [/\bdel LP bloqueado\b/g, "of LP locked"],
    [/\b(\d+) min de vida\b/g, "$1 min old"],
    [/\bMEJOR PERFIL\b/g, "BEST PROFILE"],
    [/\bAntiguedad\b/g, "Age"],
    [/\bSin historial de rug conocido\b/g, "No known rug history"],
    [/\bActualizado\s+/g, "Updated "],
    [/\bNube:\s*(\d+)\s*en vigilancia/g, "Cloud: $1 watched"],
    [/\ben vigilancia\b/g, "watched"]
  ];
  const translate = value => {
    const raw = String(value || "");
    const trimmed = raw.trim();
    if (!trimmed) return value;
    let out = exact.get(trimmed) || trimmed;
    for (const [pattern, replacement] of patterns) out = out.replace(pattern, replacement);
    if (out === trimmed) return value;
    return raw.replace(trimmed, out);
  };
  const walk = root => {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) { const next = translate(root.nodeValue); if (next !== root.nodeValue) root.nodeValue = next; return; }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    if (["SCRIPT", "STYLE"].includes(root.tagName)) return;
    for (const attr of ["placeholder", "aria-label", "title"]) {
      if (root.hasAttribute?.(attr)) { const v = root.getAttribute(attr); const n = translate(v); if (n !== v) root.setAttribute(attr, n); }
    }
    for (const child of root.childNodes) walk(child);
  };
  walk(document.body);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "characterData") walk(record.target);
      else for (const node of record.addedNodes) walk(node);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  if (document.title.includes("Sniper")) document.title = "Sniper · JamdDmaj";
})();
