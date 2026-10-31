import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setupAccountSession} from '../lib/account-session-client.js';
test('new browser tab restores server-verified cookie access without localStorage credentials',async()=>{
 let token='';const calls=[];const win={location:{origin:'https://www.jamddmaj.com'}};
 const s=setupAccountSession({win,readToken:()=>token,writeToken:v=>token=v,fetchImpl:async(url,opts)=>{calls.push(opts);return Response.json({ok:true,token:'a'.repeat(64)});}});
 await s.ready;assert.equal(token,'a'.repeat(64));assert.equal(s.status,'restored');assert.equal(calls[0].credentials,'same-origin');assert.equal(calls[0].headers.Authorization,undefined);
});
test('fresh login wins over a delayed browser restore',async()=>{
 let token='',resolve;const win={location:{origin:'https://www.jamddmaj.com'}};
 const s=setupAccountSession({win,readToken:()=>token,writeToken:v=>token=v,fetchImpl:async(url,opts)=>JSON.parse(opts.body).action==='resume'?new Promise(r=>resolve=r):Response.json({ok:true})});
 token='b'.repeat(64);await s.save(token);resolve(Response.json({ok:true,token:'a'.repeat(64)}));await s.ready;assert.equal(token,'b'.repeat(64));
});
test('temporary outage does not sign out or erase existing access',async()=>{
 let token='a'.repeat(64);const s=setupAccountSession({win:{location:{origin:'https://www.jamddmaj.com'}},readToken:()=>token,writeToken:v=>token=v,fetchImpl:()=>assert.fail()});
 await s.ready;assert.equal(token,'a'.repeat(64));
});
