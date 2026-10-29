import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function chatProgressText('),html.indexOf('// Progressive presentation of visible answer text'));
test('activity is ephemeral, uses only known stages and disappears at completion',()=>{
 let panel;const card={querySelector:()=>panel,prepend:n=>panel=n};
 const node=()=>({dataset:{},children:[],append(...v){this.children.push(...v);},setAttribute(){},remove(){panel=null;}});
 const state=new WeakMap(),context={resolvedLanguage:()=> 'es',chatActivitySteps:state,document:{createElement:node}};
 vm.createContext(context);vm.runInContext(source,context);
 const message={streaming:true,progress:'received',content:''};
 context.syncChatActivity(message,card);assert.equal(panel.children[0].textContent,'En curso');
 message.progress='lookup';context.syncChatActivity(message,card);assert.deepEqual([...state.get(message)],['received','lookup']);
 message.progress='preparing';context.syncChatActivity(message,card);message.content='Answer';context.syncChatActivity(message,card);
 assert.deepEqual([...state.get(message)],['received','lookup','preparing','display']);
 message.streaming=false;context.syncChatActivity(message,card);assert.equal(panel,null);assert.equal(state.has(message),false);
 assert.doesNotMatch(source,/reasoning_content|chain_of_thought|innerHTML/);
});
