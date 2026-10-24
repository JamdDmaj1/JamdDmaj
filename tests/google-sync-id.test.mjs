import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {linkGoogleProfile,readGoogleSyncProfile} from '../api/account.js';
import {createHandler} from '../api/account-sync.js';
import {trialHash} from '../lib/web-trial-session.js';

const secret='test-only-account-wrapping-secret-123456',first='A'.repeat(20),second='B'.repeat(20);
const identity={sub:'test-google-user',email:'fixture@example.invalid',name:'Test',picture:''};
function fixture(){const records=new Map();return {records,storage:async(_path,commands)=>commands.map(([op,key,value,nx])=>{
 if(op==='GET')return {result:records.get(key)??null};
 if(op==='SET'){if(nx==='NX'&&records.has(key))return {result:null};records.set(key,value);return {result:'OK'};}
 throw Error('Unexpected fixture operation');
})};}
test('same verified Google account keeps its original Sync ID across devices and authenticated sessions',async()=>{
 const f=fixture(),owner=await trialHash('google:'+identity.sub);
 await linkGoogleProfile({recoveryCode:first},identity,secret,f.storage);
 assert.equal((await linkGoogleProfile({recoveryCode:second},identity,secret,f.storage)).recoveryCode,first);
 assert.equal((await readGoogleSyncProfile(owner,secret,f.storage)).recoveryCode,first);
 assert.deepEqual(await readGoogleSyncProfile(await trialHash('google:another-user'),secret,f.storage),{ok:true,linked:false});
});
test('concurrent first logins cannot replace the winning Sync ID',async()=>{
 const f=fixture();const both=await Promise.all([linkGoogleProfile({recoveryCode:first},identity,secret,f.storage),linkGoogleProfile({recoveryCode:second},identity,secret,f.storage)]);
 assert.equal(both[0].recoveryCode,both[1].recoveryCode);assert.equal(f.records.size,1);
});
test('storage errors and malformed existing mappings never replace account recovery data',async()=>{
 const f=fixture();await linkGoogleProfile({recoveryCode:first},identity,secret,f.storage);const key=[...f.records.keys()][0];
 f.records.set(key,'broken');await assert.rejects(linkGoogleProfile({recoveryCode:second},identity,secret,f.storage));assert.equal(f.records.get(key),'broken');
 await assert.rejects(linkGoogleProfile({recoveryCode:second},identity,secret,async()=>[{error:'fixture failure'}]));
});
test('Sync recovery endpoint requires the existing authenticated session, never a supplied account identifier',async()=>{
 const f=fixture(),owner=await trialHash('google:'+identity.sub);await linkGoogleProfile({recoveryCode:first},identity,secret,f.storage);
 const handler=createHandler({secret:()=>secret,authenticate:async request=>{if(request.headers.get('authorization')!=='Bearer fixture-session')throw Object.assign(Error(),{status:401});return owner;},read:(account,key)=>readGoogleSyncProfile(account,key,f.storage)});
 const request=(suffix='',headers={})=>new Request('https://www.jamddmaj.com/api/account-sync'+suffix,{headers});
 assert.equal((await handler(request())).status,401);
 assert.equal((await handler(request('?account=someone-else',{'authorization':'Bearer fixture-session'}))).status,400);
 const response=await handler(request('',{'authorization':'Bearer fixture-session'}));assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).recoveryCode,first);
});
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function clientFixture({local=second,changed=false}={}){
 const values=new Map([['recovery',local]]),token='a'.repeat(64);let active=token,rendered=0;
 const context=vm.createContext({window:{JamdTrial:{getToken:()=>active}},ACCOUNT_API_URL:'https://www.jamddmaj.com/api/account',STORAGE:{recoveryCode:'recovery'},localStorage:{setItem:(k,v)=>values.set(k,v)},getRecoveryCode:()=>values.get('recovery')||'',googleSyncRecoveryCode:'',cloudBackupTimer:null,clearTimeout,AbortSignal,updateSyncAccountUi:()=>rendered++,fetch:async(url,options)=>{
  assert.equal(url,'https://www.jamddmaj.com/api/account-sync');assert.equal(options.headers.Authorization,'Bearer '+token);assert.equal(options.credentials,'omit');
  if(changed)active='b'.repeat(64);return Response.json({ok:true,linked:true,recoveryCode:first});
 }});
 const code=html.slice(html.indexOf('      async function refreshGoogleSyncId()'),html.indexOf('      function loadGoogleIdentityScript()'));
 vm.runInContext(code,context);return {context,values,rendered:()=>rendered};
}
test('session refresh displays the linked ID but preserves different local recovery and progress until explicit restore',async()=>{
 const f=clientFixture();await f.context.refreshGoogleSyncId();assert.equal(f.context.googleSyncRecoveryCode,first);assert.equal(f.values.get('recovery'),second);assert.equal(f.rendered(),1);
 const empty=clientFixture({local:''});await empty.context.refreshGoogleSyncId();assert.equal(empty.values.get('recovery'),first);assert.equal(empty.context.googleSyncRecoveryCode,'');
 const changed=clientFixture({changed:true});await changed.context.refreshGoogleSyncId();assert.equal(changed.context.googleSyncRecoveryCode,'');assert.equal(changed.values.get('recovery'),second);
});
test('a pending recovery blocks automatic cloud writes and login does not claim an unverified backup succeeded',()=>{
 const block=html.slice(html.indexOf('      async function syncCloudBackup('),html.indexOf('      async function restoreCloudBackup()'));
 assert.match(block,/if \(googleSyncRecoveryCode\) \{\s*updateSyncAccountUi\(\);\s*return false;/);
 assert.doesNotMatch(html,/Google linked and progress protected/);
 const login=html.slice(html.indexOf('      async function applyGoogleAccountResponse('),html.indexOf('      async function refreshGoogleSyncId()'));
 assert.doesNotMatch(login,/restoreCloudBackupWithCode/);
});

test('Account settings retrieves the linked ID in a real browser without replacing the local recovery code',
 {skip:!process.env.JAMDDMAJ_TEST_BROWSER_MODULE},async()=>{
 const {chromium}=await import(process.env.JAMDDMAJ_TEST_BROWSER_MODULE),f=fixture(),owner=await trialHash('google:'+identity.sub);
 await linkGoogleProfile({recoveryCode:first},identity,secret,f.storage);
 const handler=createHandler({authenticate:async request=>{assert.equal(request.headers.get('authorization'),'Bearer '+'a'.repeat(64));return owner;},secret:()=>secret,read:(id,key)=>readGoogleSyncProfile(id,key,f.storage)});
 const browser=await chromium.launch({headless:true,executablePath:process.env.JAMDDMAJ_TEST_BROWSER_EXECUTABLE});
 try {const page=await browser.newPage({viewport:{width:1365,height:900}});let posts=0;
  await page.addInitScript(({local,token})=>{localStorage.setItem('jamdV3RecoveryCode',local);localStorage.setItem('jamdV4AccountProfile',JSON.stringify({provider:'google',email:'fixture@example.invalid'}));sessionStorage.setItem('jamdWebTrialSession',token);},{local:second,token:'a'.repeat(64)});
  await page.route('https://www.jamddmaj.com/',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.route('**/api/**',async route=>{const request=route.request(),path=new URL(request.url()).pathname;
   if(request.method()!=='GET'){posts++;return route.abort();}
   if(path==='/api/account')return route.fulfill({json:{ok:true,google:{enabled:true,clientId:'fixture'}}});
   if(path==='/api/perps-identity')return route.fulfill({json:{ok:true,accountHash:owner,verifiedAt:Date.now()}});
   if(path==='/api/account-sync'){const response=await handler(new Request(request.url(),{headers:request.headers()}));return route.fulfill({status:response.status,json:await response.json()});}
   return route.fulfill({status:503,json:{error:'UNRELATED_FIXTURE_ENDPOINT'}});
  });
  await page.goto('https://www.jamddmaj.com/',{waitUntil:'domcontentloaded'});await page.locator('#topSettingsBtn').click();await page.locator('[data-settings-panel="account"]').click();
  await page.locator('#syncAccountStatus').filter({hasText:'This is the Sync ID linked to Google'}).waitFor();
  assert.ok((await page.locator('#syncAccountId').textContent()).endsWith('AAAA'));assert.equal(await page.evaluate(()=>localStorage.getItem('jamdV3RecoveryCode')),second);
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('#restoreSyncAccountBtn').click();assert.equal(await page.evaluate(()=>localStorage.getItem('jamdV3RecoveryCode')),second);assert.equal(posts,0);
 }finally{await browser.close();}
});
