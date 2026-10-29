import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function productGuideEntries('),html.indexOf('function buildApiMessages('));
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
 assert.match(f.productGuideContext(),/not live account\/execution status/);assert.match(html,/productGuideContext\(\) \+ "\\n\\n" \+ productCapabilityFacts\(\)/);
});

test('product questions use verified capability and allowance answers without provider guesses',()=>{
 const f=fixture();
 for(const q of ['Y tengo que pagar para hablar contigo?','Osea que hay planes?','cuantos mensajes gratis tengo']){
  const r=f.productGuideHelp(q);assert.equal(r.id,'settingsBtn');assert.match(r.text,/50 mensajes gratis cada 5 horas/);assert.match(r.text,/no.*inventar planes/i);
 }
 const deposit=f.productGuideHelp('Y se puede meter dinero real?');assert.match(deposit.text,/recibir cripto real/);assert.match(deposit.text,/No es un depósito bancario/);
 const trade=f.productGuideHelp('Pero puedo hacer algún tipo de trade');assert.match(trade.text,/sí tiene operaciones reales/);assert.match(trade.text,/no puedo confirmar/i);assert.match(trade.text,/Pro Signals es el escáner/);
 assert.match(f.productCapabilityFacts(),/Do not invent subscription plans/);assert.match(f.productCapabilityFacts(),/Never categorically say the whole app cannot trade/);assert.equal(f.clicks(),0);
 const en=fixture('en').productGuideHelp('Can I trade?');assert.match(en.text,/includes real operations/);
});
test('wallet follow-up uses only the current conversation topic and never invents connected accounts',()=>{
 const f=fixture('en'),history=[{role:'assistant',navigationTarget:'walletBtn'},{role:'user',content:'anything'}];
 const reply=f.productGuideHelp('y que puedo conectar',history);assert.equal(reply.id,'sideAssetsBtn');assert.match(reply.text,/Phantom/);assert.match(reply.text,/incógnito/);assert.match(reply.text,/no mueve fondos/);
 assert.equal(f.productGuideHelp('y que puedo conectar',[]),null);
 assert.equal(f.productGuideHelp('y que puedo conectar',[{role:'assistant',navigationTarget:'sideSignalsBtn'}]),null);
 assert.equal(f.clicks(),0);
});
