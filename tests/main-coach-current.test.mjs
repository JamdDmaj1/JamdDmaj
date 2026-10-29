import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
function steps(name){return vm.runInNewContext(source.match(new RegExp('const '+name+' = (\\[[\\s\\S]*?\\n      \\]);'))[1]);}
test('both main tours cover current wallet, trade and bot workflow with real target IDs',()=>{
 const es=steps('MAIN_COACH_STEPS'),en=steps('MAIN_COACH_STEPS_EN');assert.equal(es.length,en.length);assert.equal(en.length,15);
 for(const list of [es,en])for(const step of list){if(step.selector.startsWith('#'))assert.ok(source.includes(`id="${step.selector.slice(1)}"`),step.selector);}
 for(const list of [es,en]){assert.ok(list.some(x=>x.selector==='#sideAssetsBtn'&&x.sidebar));assert.ok(list.some(x=>x.selector==='#sideFuturesBtn'&&x.sidebar));assert.ok(list.some(x=>x.selector==='#sideAutomationBtn'&&x.sidebar));assert.ok(list.some(x=>x.selector==='#tradingDemoBtn'));}
 assert.match(en.map(x=>x.text).join(' '),/Saving pauses entries/);assert.match(en.map(x=>x.text).join(' '),/amount slider/);
 assert.doesNotMatch(source,/Normal chat works through JamdDmaj without creating an account/);
});
test('tour cancels delayed steps, reveals sidebar targets and clamps variable height',()=>{
 assert.match(source,/clearTimeout\(mainCoachTimer\)/);assert.match(source,/if \(step.sidebar\) openSidebar\(\); else closeSidebar\(\)/);
 assert.match(source,/coach.getBoundingClientRect\(\).height/);assert.match(source,/window.innerHeight - height - 12/);
});
