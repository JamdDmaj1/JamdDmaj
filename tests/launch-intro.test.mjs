import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const script=html.slice(html.indexOf('// Cosmetic only:'),html.indexOf('</script>',html.indexOf('// Cosmetic only:')));
test('launch intro dismisses after its own animation, with timeout and page exit fallbacks',()=>{
 let removed=0,timeout,exit,handler;
 const intro={remove(){removed++;},addEventListener(name,fn){assert.equal(name,'animationend');handler=fn;}};
 vm.runInNewContext(script,{document:{getElementById:()=>intro},window:{setTimeout(fn,ms){assert.equal(ms,1900);timeout=fn;},addEventListener(name,fn){assert.equal(name,'pagehide');exit=fn;}}});
 handler({target:{}});assert.equal(removed,0);handler({target:intro});assert.equal(removed,1);timeout();exit();assert.equal(removed,3);
});
test('intro is cosmetic, accessible and does not block app initialization',()=>{
 assert.match(html,/id="launchIntro" aria-hidden="true"/);
 assert.match(html,/\.launch-intro \{[\s\S]*?pointer-events: none/);
 assert.match(html,/@media \(prefers-reduced-motion: reduce\) \{\s*\.launch-intro \{ display: none;/);
 assert.match(html,/<img src="icon-192.png" alt=""/);
 assert.doesNotMatch(script.replace(/\/\/[^\n]*/g,''),/fetch\(|localStorage|sessionStorage|wallet|await /i);
});
