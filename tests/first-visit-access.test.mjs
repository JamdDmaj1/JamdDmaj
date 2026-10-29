import test from 'node:test';
import assert from 'node:assert/strict';
import {firstVisitSessionStatus,setupFirstVisitAccess,FIRST_VISIT_KEY} from '../lib/first-visit-access.js';

const token='a'.repeat(64);
function fixture(){
 const storage=new Map(),nodes=[],created=[];
 const doc={body:{append(n){nodes.push(n)}},createElement(tag){const n={tag,style:{},append(){},setAttribute(){},addEventListener(){},showModal(){this.open=true},close(){this.open=false},remove(){}};created.push(n);return n;},getElementById(){return null}};
 const win={localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},location:{search:'',assign(url){this.assigned=url}},addEventListener(){},removeEventListener(){}};
 return {doc,win,storage,nodes,created};
}
test('a saved profile without a verified session is not login',async()=>{
 assert.equal(await firstVisitSessionStatus({sessionStorage:{getItem:()=>null},googleProfile:{email:'fixture@example.invalid'}}),false);
});
test('session must be fresh, server verified and unchanged',async()=>{
 const win={JamdTrial:{getToken:()=>token},fetch:async()=>new Response(JSON.stringify({ok:true,accountHash:'b'.repeat(64),verifiedAt:Date.now()}),{headers:{'content-type':'application/json'}})};
 assert.equal(await firstVisitSessionStatus(win),true);
 win.fetch=async()=>new Response(JSON.stringify({ok:true,accountHash:'b'.repeat(64),verifiedAt:Date.now()-60000}),{headers:{'content-type':'application/json'}});
 assert.equal(await firstVisitSessionStatus(win),false);
});
test('new visitor sees access prompt; only verification acknowledges it',async()=>{
 const f=fixture();const gate=setupFirstVisitAccess('es',f.doc,f.win,{verify:async()=>false});await gate.ready;
 assert.equal(f.nodes[0].open,true);assert.equal(f.storage.has(FIRST_VISIT_KEY),false);gate.dispose();
 const valid=setupFirstVisitAccess('es',f.doc,f.win,{verify:async()=>true});await valid.ready;
 assert.equal(f.storage.get(FIRST_VISIT_KEY),'true');valid.dispose();
});
test('return visitor acknowledgement does not grant wallet permissions',async()=>{
 const f=fixture();f.storage.set(FIRST_VISIT_KEY,'true');let checks=0;
 const gate=setupFirstVisitAccess('en',f.doc,f.win,{verify:async()=>{checks++;return false}});await gate.ready;
 assert.equal(checks,0);assert.notEqual(f.nodes[0].open,true);assert.equal(f.win.JamdTrial,undefined);gate.dispose();
});

test('check button shows progress and actionable recovery; exceptions never leave it disabled',async()=>{
 const f=fixture();let checks=0;
 const gate=setupFirstVisitAccess('en',f.doc,f.win,{verify:async()=>{checks++;if(checks===3)throw Error('offline');return false;}});await gate.ready;
 const check=f.created.find(n=>n.className==='jw-check'),status=f.created.find(n=>n.className==='jw-status');
 const result=check.onclick();assert.equal(check.disabled,true);assert.match(status.textContent,/Checking/);await result;
 assert.equal(check.disabled,false);assert.match(status.textContent,/Sign in with Google/);
 await check.onclick();assert.equal(check.disabled,false);assert.match(status.textContent,/connection/);gate.dispose();
});
