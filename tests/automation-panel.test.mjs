import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAutomationDraft,setupAutomationPanel} from '../lib/automation-panel.js';
test('automation draft validates limits and drops activation fields',()=>{
 assert.deepEqual(validateAutomationDraft({capital:100,loss:10,positions:2,enabled:true}),{capital:100,loss:10,positions:2});
 for(const v of [{capital:0,loss:1,positions:1},{capital:1,loss:2,positions:1},{capital:100,loss:1,positions:1.5},{capital:Infinity,loss:1,positions:1}])assert.throws(()=>validateAutomationDraft(v));
});
test('automation never activates from saved data and only persists limits',()=>{
 const all=[],writes=[];const node=()=>{const n={children:[],append(...v){this.children.push(...v);},setAttribute(){}};all.push(n);return n;};
 setupAutomationPanel(node(),'en',{createElement:node},{getItem:()=>JSON.stringify({capital:100,loss:10,positions:2,enabled:true}),setItem:(k,v)=>writes.push(JSON.parse(v))});
 assert.equal(writes.length,0);assert.equal(all.filter(n=>n.disabled).length,3);
 all.find(n=>n.textContent==='Save draft').onclick();assert.deepEqual(writes,[{capital:100,loss:10,positions:2}]);
});
