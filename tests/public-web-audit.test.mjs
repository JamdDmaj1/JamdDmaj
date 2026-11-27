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
