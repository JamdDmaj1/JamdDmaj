import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('markets uses the main workspace instead of competing scroll drawers',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/\.main > \.ticker:not\(\.is-hidden\)\s*\{[^}]*flex: 1 1 0;[^}]*max-height: none;/);
 assert.match(html,/\.ticker:not\(\.is-hidden\) ~ \.messages,[\s\S]*?\.composer-wrap \{ display: none; \}/);
 assert.match(html,/id="backToChatFromMarkets"/);assert.match(html,/getElementById\("backToChatFromMarkets"\).addEventListener\("click", toggleMarkets\)/);
});
