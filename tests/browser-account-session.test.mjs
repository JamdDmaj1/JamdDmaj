import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserAccountSessionHandler,ACCOUNT_COOKIE} from '../lib/browser-account-session.js';
const token='a'.repeat(64),account='b'.repeat(64);
const request=(action,headers={})=>new Request('https://www.jamddmaj.com/api/account-session',{method:'POST',headers:{Origin:'https://www.jamddmaj.com','Content-Type':'application/json',...headers},body:JSON.stringify({action})});
test('remember uses HttpOnly Secure host-only cookie with remaining lifetime, not extended expiry',async()=>{
 const commands=[];const handler=browserAccountSessionHandler({authenticate:async()=>account,storage:async(path,c)=>{commands.push(...c);return [{result:1234}];}});
 const r=await handler(request('remember',{Authorization:'Bearer '+token}));assert.equal(r.status,200);
 const cookie=r.headers.get('set-cookie');for(const text of ['HttpOnly','Secure','SameSite=Strict','Path=/','Max-Age=1234'])assert.ok(cookie.includes(text));
 assert.equal(cookie.includes('Domain='),false);assert.deepEqual(await r.json(),{ok:true});assert.equal(commands.some(c=>c[0]==='SET'||c[0]==='EXPIRE'),false);
});
test('resume authenticates original cookie and never revives rejected sessions',async()=>{
 let checked;const handler=browserAccountSessionHandler({authenticate:async r=>{checked=r.headers.get('authorization');return account;},storage:async()=>[{result:300}]});
 const r=await handler(request('resume',{Cookie:ACCOUNT_COOKIE+'='+token}));assert.equal(r.status,200);assert.equal(checked,'Bearer '+token);assert.equal((await r.json()).token,token);
 const rejected=browserAccountSessionHandler({authenticate:async()=>{throw Object.assign(Error(),{status:401});}});
 const failure=await rejected(request('resume',{Cookie:ACCOUNT_COOKIE+'='+token}));assert.equal(failure.status,401);assert.ok(failure.headers.get('set-cookie').includes('Max-Age=0'));
});
test('cross-origin, duplicate cookies and malformed sessions cannot recover access',async()=>{
 const handler=browserAccountSessionHandler({authenticate:async()=>assert.fail('must not authenticate')});
 assert.equal((await handler(request('resume',{Origin:'https://evil.invalid'}))).status,403);
 assert.equal((await handler(request('resume',{Cookie:`${ACCOUNT_COOKIE}=${token}; ${ACCOUNT_COOKIE}=${token}`}))).status,401);
 assert.equal((await handler(request('resume'))).status,401);
});
test('an expired older tab cannot erase a newer browser cookie',async()=>{
 const handler=browserAccountSessionHandler({authenticate:async()=>{throw Object.assign(Error(),{status:401});}});
 const r=await handler(request('remember',{Authorization:'Bearer '+token,Cookie:ACCOUNT_COOKIE+'='+'c'.repeat(64)}));
 assert.equal(r.status,401);assert.equal(r.headers.get('set-cookie'),null);
});
