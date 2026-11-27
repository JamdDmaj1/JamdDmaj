#!/usr/bin/env node
// Read-only production smoke check. Safe to run repeatedly after a release.
const base = (process.env.JAMDDMAJ_PUBLIC_BASE || 'https://www.jamddmaj.com').replace(/\/$/, '');
const expectedVersion = String(process.argv[2] || '').trim();
const pages = ['/', '/discover.html', '/sniper.html', '/private-simulator.html', '/terms.html', '/privacy.html', '/wallet-web.html', '/fee-recipient-setup.html', '/404.html'];
const failures = [];

async function text(path, options = {}) {
  const response = await fetch(base + path, {redirect: 'follow', ...options});
  const body = await response.text();
  return {response, body};
}

try {
  const status = await (await fetch(base + '/api/status', {cache: 'no-store'})).json();
  if (expectedVersion && status.version !== expectedVersion) failures.push(`status.version=${status.version}, expected ${expectedVersion}`);
  for (const path of pages) {
    const {response, body} = await text(path, {cache: 'no-store'});
    if (response.status !== 200) failures.push(`${path} -> HTTP ${response.status}`);
    if (!/<html\b[^>]*\blang="en"/i.test(body)) failures.push(`${path} missing lang=en`);
    const h1 = (body.match(/<h1\b/gi) || []).length;
    if (h1 !== 1) failures.push(`${path} has ${h1} h1 elements`);
  }
  const missing = await text('/__jamddmaj_missing_route__', {cache: 'no-store'});
  if (missing.response.status !== 404) failures.push(`missing route -> HTTP ${missing.response.status}, expected 404`);
  if (!/Page not found/i.test(missing.body)) failures.push('custom 404 content not served');
  const manifest = await (await fetch(base + '/manifest.json', {cache: 'no-store'})).json();
  if (manifest.lang !== 'en') failures.push(`manifest.lang=${manifest.lang}, expected en`);
  if (!String(manifest.description || '').startsWith('AI assistant')) failures.push('manifest description is not the English copy');
  if (failures.length) {
    console.error('PUBLIC RELEASE CHECK FAILED');
    for (const failure of failures) console.error('- ' + failure);
    process.exitCode = 1;
  } else {
    console.log(`PUBLIC RELEASE CHECK OK ${status.version}`);
    console.log(`pages=${pages.length} 404=custom manifest=en`);
  }
} catch (error) {
  console.error('PUBLIC RELEASE CHECK FAILED:', error?.message || error);
  process.exitCode = 1;
}
