import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('public pages keep one page heading, English metadata and a favicon', () => {
  for (const name of ['index.html', 'terms.html', 'privacy.html', 'wallet-web.html', 'sniper.html']) {
    const html = read(name);
    assert.equal((html.match(/<h1\b/gi) || []).length, 1, name);
    assert.match(html, /<html\s+lang="en"/i, name);
    assert.match(html, /rel="icon"[^>]*icon-192\.png/i, name);
  }
});

test('legal and wallet pages no longer expose the old Spanish shell', () => {
  for (const name of ['terms.html', 'privacy.html', 'wallet-web.html', 'oauth-mobile.html']) {
    const html = read(name);
    assert.doesNotMatch(html, /<html\s+lang="es"/i, name);
    assert.match(html, /<meta name="viewport"/i, name);
  }
  const wallet = read('wallet-web.html');
  assert.match(wallet, /Unlock in this browser/);
  assert.doesNotMatch(wallet, /Desbloquear en este navegador/);
});

test('operator fee setup page is English and keeps its safety status', () => {
  const html = read('fee-recipient-setup.html');
  assert.match(html, /<html lang="en"/i);
  assert.match(html, /Prepare USDC fee reception/);
  assert.match(html, /No USDC will be transferred/);
  assert.doesNotMatch(html, /Receptor USDC|Preparar recepción/);
});

test('sitemap includes the public product and legal pages', () => {
  const sitemap = read('sitemap.xml');
  for (const path of ['/', '/discover.html', '/sniper.html', '/terms.html', '/privacy.html']) {
    assert.match(sitemap, new RegExp(`https://www\\.jamddmaj\\.com${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), path);
  }
});

test('Sniper exposes accessible search and symbol search API', () => {
  const html = read('sniper.html');
  const js = read('sniper.js');
  const api = read('api/sniper.js');
  assert.match(html, /aria-label="Search token name or contract address"/);
  assert.match(html, /rel="canonical"[^>]*sniper\.html/);
  assert.match(js, /\/api\/sniper\?q=/);
  assert.match(api, /search\/pools/);
});

test('release notes cannot open on top of the first-visit access dialog', () => {
  const html = read('index.html');
  assert.match(html, /const access = document\.getElementById\('first-visit-access'\);/);
  assert.match(html, /!access\?\.open/);
});

test('retired internal testnet page is not part of the public build', () => {
  const build = read('scripts/build-web.mjs');
  assert.doesNotMatch(build, /hyperliquid-testnet/);
});

test('desktop backup export falls back to a real download', () => {
  const html = read('index.html');
  assert.match(html, /nativeOrMobile/);
  assert.match(html, /if \(canShare && nativeOrMobile\)/);
});

test('Automation deep link targets the visible automation card', () => {
  assert.match(read('lib/automation-panel-simple.js'), /section\.id = 'jamd-automation'/);
  assert.match(read('lib/terminal-layout.js'), /scrollIntoView/);
});

test('Fair Launch mainnet panels are English', () => {
  const html = read('index.html');
  assert.match(html, /Create token · Solana mainnet/);
  assert.match(html, /Pool and liquidity · Token \/ USDC/);
  assert.match(html, /Protected lab · Devnet only/);
  assert.doesNotMatch(html, /Crear token|Pool y liquidez|Laboratorio protegido/);
});

test('Fair Launch mainnet dynamic messages are English', () => {
  assert.doesNotMatch(read('token-creator-ui.js'), /No se pudo|No se detect|Comisión|Revisión/);
  assert.doesNotMatch(read('cpmm-pool-ui.js'), /No se pudo|No se conect|Aportación|Comisión/);
  assert.match(read('token-creator-ui.js'), /Could not read the saved operation/);
  assert.match(read('cpmm-pool-ui.js'), /Could not read the pending operation/);
});

test('PWA manifest matches the English public app', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.lang, 'en');
  assert.doesNotMatch(manifest.description, /asistente|visión|imágenes/i);
  assert.match(manifest.description, /AI assistant/);
});

test('Finance page language follows the selected app language', () => {
  assert.match(read('private-simulator.html'), /<html lang="en"/i);
  assert.match(read('private-simulator-ui.js'), /document\.documentElement\.lang = language/);
});

test('custom 404 page is present, English and linked to core pages', () => {
  const html = read('404.html');
  assert.match(html, /<html lang="en"/i);
  assert.match(html, /Page not found/);
  assert.match(html, /href="\/sniper.html"/);
  assert.doesNotMatch(html, /<html lang="es"/i);
});

test('transient sign-in and wallet pages are not indexed', () => {
  for (const name of ['google-mobile.html', 'oauth-mobile.html', 'wallet-web.html']) {
    assert.match(read(name), /name="robots" content="noindex,nofollow"/, name);
  }
});

test('Fair Launch query opens the view and exit clears it', () => {
  const js = read('fair-launch-ui.js');
  assert.match(js, /view.*=== "fair-launch"/);
  assert.match(js, /url\.searchParams\.delete\("view"\)/);
});

test('oversized cloud backups fail clearly instead of retrying forever', () => {
  assert.match(read('index.html'), /too large for the cloud/);
  assert.match(read('api/backup.js'), /The backup is too large/);
});

test('Discover keeps its advertised language selector usable', () => {
  const js = read('discover.js');
  assert.doesNotMatch(js, /language\.hidden = true/);
  assert.match(js, /language\.hidden = false/);
});

test('public app and Discover link to Terms and Privacy', () => {
  for (const name of ['index.html', 'discover.html', 'sniper.html']) {
    const html = read(name);
    assert.match(html, /href="\/terms\.html"/, name);
    assert.match(html, /href="\/privacy\.html"/, name);
  }
});

test('shareable public pages expose complete English social metadata', () => {
  for (const name of ['index.html', 'discover.html', 'sniper.html', 'terms.html', 'privacy.html']) {
    const html = read(name);
    assert.match(html, /property="og:title"/, name);
    assert.match(html, /property="og:description"/, name);
    assert.match(html, /property="og:image"/, name);
    assert.match(html, /name="twitter:card"/, name);
  }
  const discover = read('discover.html');
  assert.doesNotMatch(discover, /Descubre todo lo que puedes hacer/);
});

test('top Trade button routes to the Trade view', () => {
  assert.match(read('index.html'), /private-simulator\.html\?v=9#view=trade&lang=/);
});
