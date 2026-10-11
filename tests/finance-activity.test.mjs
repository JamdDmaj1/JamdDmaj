import test from 'node:test';
import assert from 'node:assert/strict';
import {setupFinanceActivity} from '../lib/finance-activity.js';
test('activity only queries readiness and order status on explicit clicks',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),session=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=> 'public-test-device-123'}});Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:()=> 'test-request'}});
 try{
 const all=[],calls=[];const node=()=>{const n={children:[],append(...v){this.children.push(...v);},replaceChildren(...v){this.children=v;},setAttribute(){}};all.push(n);return n;};
 setupFinanceActivity(node(),'en',{createElement:node},async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({readiness:{readOnly:true,freshHeartbeat:true},positions:[],status:'pending'})};});
 assert.equal(calls.length,0);await all.find(n=>n.textContent==='Check positions').onclick();await all.find(n=>n.textContent==='Latest request').onclick();
 assert.deepEqual(calls,[{action:'manualReadiness'},{action:'manualOrderStatus',requestId:'test-request'}]);
 }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;if(session)Object.defineProperty(globalThis,'sessionStorage',session);else delete globalThis.sessionStorage;}
});
