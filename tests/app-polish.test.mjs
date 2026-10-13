import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('shared visual layer is bundled and honors reduced motion and keyboard focus',()=>{
 const css=readFileSync(new URL('../app-polish.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const build=readFileSync(new URL('../scripts/build-web.mjs',import.meta.url),'utf8');
 assert.match(html,/href="app-polish.css"/);assert.match(build,/"app-polish.css"/);
 assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/focus-visible/);assert.match(css,/data-finance-motion=false/);
 assert.doesNotMatch(css,/animation:[^;]*infinite/);
});
