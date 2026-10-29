import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function productGuideEntries()'),html.indexOf('function buildApiMessages('));
function fixture(language='es',missing=false){let clicks=0;const c={resolvedLanguage:()=>language,document:{getElementById:()=>missing?null:{textContent:'private account fixture',click(){clicks++;}}}};vm.createContext(c);vm.runInContext(source,c);return {...c,clicks:()=>clicks};}
test('every guide destination refers to an actual build button and guide never invokes it automatically',()=>{
 const f=fixture();for(const entry of f.productGuideEntries())assert.ok(html.includes('id="'+entry.id+'"'),entry.id);
 assert.equal(f.clicks(),0);assert.doesNotMatch(f.productGuideContext(),/private account fixture/);
});
test('actual Pro Signals complaint gets exact sidebar location and scrolling advice, not guessed tabs',()=>{
 const f=fixture(),reply=f.productGuideHelp('Pro Signals no veo algo como esto');assert.equal(reply.id,'sideSignalsBtn');assert.match(reply.text,/barra lateral/);assert.match(reply.text,/desplázate/);assert.match(reply.text,/no activa el bot/);assert.equal(f.clicks(),0);
 const en=fixture('en').productGuideHelp("Where can I find Pro Signals?");assert.match(en.text,/Scroll inside the sidebar/);
 assert.match(fixture('en').productGuideHelp('Pro Signals no veo algo como esto').text,/barra lateral/);
});
test('unknown questions and market analysis do not trigger deterministic navigation replies',()=>{
 const f=fixture();for(const text of ['Por qué sube BTC','Where is my sandwich','cómo llego al botón inexistente','Pro Signals is useful'])assert.equal(f.productGuideHelp(text),null);
});
test('unavailable button never becomes an executable target or fabricated route',()=>{
 const f=fixture('es',true),reply=f.productGuideHelp('dónde está Pro Signals');assert.equal(reply.id,null);assert.match(reply.text,/no está presente/);assert.doesNotMatch(f.productGuideContext(),/Pro Signals:/);
});
test('guide knows explicit Automation and Assets paths without inventing signing or trading status',()=>{
 const f=fixture();assert.equal(f.productGuideHelp('cómo entro a automatización').id,'sideAutomationBtn');assert.match(f.productGuideHelp('dónde está swap').text,/billetera.*Recibir, Swap o Enviar/);
 assert.match(f.productGuideContext(),/not live account\/execution status/);assert.match(html,/result\[0\]\.content \+= "\\n\\n" \+ productGuideContext\(\)/);
});
