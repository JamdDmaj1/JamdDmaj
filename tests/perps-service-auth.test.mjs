import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerpsServiceAuthenticator} from '../lib/perps-service-auth.js';
import {createPerpsSessionIdentityHandler} from '../lib/perps-session-identity.js';
import {authenticateTrial} from '../lib/web-trial-session.js';
const now=Date.parse('2026-10-19T12:00:00Z'),token='c'.repeat(64),account='a'.repeat(64);
function request(headers={Authorization:'Bearer '+token}){return new Request('https://service.example/v1/automation',{headers});}
test('VPS authenticates against the real session-ledger interface without forwarding client identity, cookies or URLs',async()=>{
 const ledger=async()=>[{result:account}],handler=createPerpsSessionIdentityHandler({authenticate:r=>authenticateTrial(r,ledger),now:()=>now}),calls=[];
 const auth=createPerpsServiceAuthenticator({now:()=>now,fetchImpl:async(url,options)=>{calls.push({url,options});return handler(new Request(url,options));}});
 assert.equal(await auth(request({Authorization:'Bearer '+token,Cookie:'do-not-forward', 'x-owner-account-hash':'b'.repeat(64)})),account);
 assert.equal(calls[0].url,'https://www.jamddmaj.com/api/perps-identity');assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.redirect,'error');
 assert.deepEqual(Object.keys(calls[0].options.headers).sort(),['Accept','Authorization']);assert.equal(calls[0].options.credentials,'omit');
});
test('identity handler neither accepts tokens in queries nor turns session failure into a financial identity',async()=>{
 const handler=createPerpsSessionIdentityHandler({authenticate:async()=>{throw Object.assign(Error('private storage error'),{status:401});},now:()=>now});
 for(const headers of [{},{Cookie:token},{Authorization:token}])assert.equal((await handler(new Request('https://www.jamddmaj.com/api/perps-identity',{headers}))).status,401);
 assert.equal((await handler(new Request('https://www.jamddmaj.com/api/perps-identity?token='+token,{headers:{Authorization:'Bearer '+token}}))).status,400);
 assert.equal((await handler(new Request('https://www.jamddmaj.com/api/perps-identity',{method:'POST'}))).status,405);
 const denied=await handler(new Request('https://www.jamddmaj.com/api/perps-identity',{headers:{Authorization:'Bearer '+token}}));assert.equal(denied.status,401);assert.equal((await denied.text()).includes('private'),false);
});
test('expired identities, wrong owners, redirects, malformed/oversized replies and provider outages fail closed',async()=>{
 for(const reply of [
  ()=>Response.json({ok:true,accountHash:account,verifiedAt:now-10001}),()=>Response.json({ok:true,accountHash:account,verifiedAt:now+2001}),
  ()=>Response.json({ok:true,accountHash:'not-a-server-identity',verifiedAt:now}),()=>Response.json({accountHash:account,verifiedAt:now}),
  ()=>new Response(null,{status:302,headers:{Location:'https://attacker.example'}}),()=>new Response('private server error',{status:503}),
  ()=>Response.json({data:'x'.repeat(5000)}),()=>new Response('invalid',{headers:{'Content-Type':'application/json'}})
 ]){
  let calls=0;const auth=createPerpsServiceAuthenticator({now:()=>now,fetchImpl:async()=>{calls++;return reply();}});
  await assert.rejects(auth(request()),/^Error: PERPS_SESSION_IDENTITY_UNAVAILABLE$/);assert.equal(calls,1);
 }
 const auth=createPerpsServiceAuthenticator({fetchImpl:async()=>new Response(null,{status:401})});await assert.rejects(auth(request()),e=>e.status===401);
});
