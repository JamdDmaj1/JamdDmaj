import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('Devnet completion refreshes controls without replacing transaction result',async()=>{
 const source=await readFile(new URL('../fair-launch-ui.js',import.meta.url),'utf8');
 assert.match(source,/function updateDevnetReadiness\(preserveStatus = false\)/);
 assert.match(source,/status\.dataset\.running === "true" \|\| preserveStatus/);
 assert.equal((source.match(/status\.dataset\.running = "false";\s+updateDevnetReadiness\(true\)/g)||[]).length,2);
 assert.match(source,/!devnetConfirm\?\.checked \|\| status\.dataset\.running === "true"/);
});
