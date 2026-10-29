import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('sidebar separates desktop toggle from mobile overlay and exposes expanded state',async()=>{
 const s=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(s,/#mobileOverlay.show \{ display: none; \}/);
 assert.match(s,/mobileOverlay.classList.toggle\("show", mobile\)/);
 assert.match(s,/getElementById\("menuBtn"\).addEventListener\("click", toggleSidebar\)/);
 assert.match(s,/aria-controls="sidebar" aria-expanded=/);
 assert.match(s,/sidebar-collapsed/);
});
