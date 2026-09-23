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
  main.querySelector('.badge').textContent = 'JAMDDMAJ / BITGET';
  heading.textContent = es ? 'Tu terminal de Bitget' : 'Your Bitget terminal';
  const menu = doc.createElement('details');
  menu.id = 'practice-menu';
  const summary = doc.createElement('summary');
  summary.textContent = es ? 'Más opciones · Simulador de práctica' : 'More options · Practice simulator';
  summary.style.cssText = 'cursor:pointer;padding:14px 0;color:#9badc5';
  menu.append(summary, intro, search, notice, stats, chart, history);
  main.append(menu);
  // Closed on every visit. Practice positions remain intact when toggling it.
  menu.open = false;
}
