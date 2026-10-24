import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {relinkGoogleSync} from '../lib/google-sync-relink.js';
import {linkGoogleProfile,readGoogleSyncProfile} from '../api/account.js';
import {trialHash} from '../lib/web-trial-session.js';
import {createHandler} from '../api/account-sync.js';

const secret='fixture-only-relink-wrapping-secret-123456',oldCode='A'.repeat(20),original='B'.repeat(20),third='C'.repeat(20),token='a'.repeat(64);
const identity={sub:'fixture-relink-user',email:'fixture@example.invalid',name:'Test',picture:''};
async function fixture(){
 const map=new Map(),owner=await trialHash('google:'+identity.sub);let conflict=false,broken=false;
 const storage=async(_path,commands)=>commands.map(command=>{
  const [op,key,value,nx]=command;
  if(op==='GET')return {result:map.get(key)??null};
  if(op==='SET'){if(nx==='NX'&&map.has(key))return {result:null};map.set(key,value);return {result:'OK'};}
  if(op==='EVAL'){
   if(broken)throw Error('fixture unavailable');
   const [,script,count,account,archive,previous,selected,expected,previousRaw,selectedRaw,history,replacement]=command;
   assert.equal(count,4);assert.doesNotMatch(script,/\bDEL\b/);
   if(conflict||map.get(account)!==expected||(map.get(previous)??'')!==previousRaw||map.get(selected)!==selectedRaw||map.has(archive))return {result:0};
   map.set(archive,history);map.set(account,replacement);return {result:1};
  }throw Error('Unexpected fixture operation');
 });
 await linkGoogleProfile({recoveryCode:oldCode},identity,secret,storage);
 const backup=JSON.stringify({encrypted:{iv:'D'.repeat(16),data:'E'.repeat(32)},updatedAt:new Date().toISOString()});
 for(const code of [oldCode,original,third])map.set('jamd:backup:'+await trialHash(code),backup);
 const input={recoveryCode:original,expectedRecoveryHash:await trialHash(oldCode),expectedBackupHash:await trialHash(JSON.stringify(JSON.parse(backup).encrypted)),explicitApproval:true};
 return {map,owner,storage,input,conflict:()=>{conflict=true;},broken:()=>{broken=true;}};
}
test('relink atomically archives the former mapping and both encrypted backups without overwriting either backup',async()=>{
 const f=await fixture(),before=new Map(f.map),result=await relinkGoogleSync(f.owner,f.input,secret,{storage:f.storage});assert.equal(result.changed,true);
 assert.equal((await readGoogleSyncProfile(f.owner,secret,f.storage)).recoveryCode,original);
 const entries=[...f.map.entries()].filter(([key])=>key.startsWith('jamd:account:sync-archive:'));assert.equal(entries.length,1);
 const archive=JSON.parse(entries[0][1]);assert.equal(archive.previousAccount,before.get('jamd:account:google:'+f.owner.slice(0,32)));
 for(const code of [oldCode,original]){const key='jamd:backup:'+await trialHash(code);assert.equal(f.map.get(key),before.get(key));}
 assert.equal(archive.previousBackup,before.get('jamd:backup:'+await trialHash(oldCode)));assert.equal(archive.selectedBackup,before.get('jamd:backup:'+await trialHash(original)));
 assert.equal(JSON.stringify(archive).includes(original),false);assert.equal(JSON.stringify(result).includes(original),false);
});
test('missing original backup, stale approval, other account, invalid consent and mutation failure preserve the current association',async()=>{
 for(const mode of ['missing','stale','backupChanged','owner','consent','conflict','broken']){
  const f=await fixture();let owner=f.owner,input={...f.input};
  if(mode==='missing')f.map.delete('jamd:backup:'+await trialHash(original));
  if(mode==='stale')input.expectedRecoveryHash='f'.repeat(64);
  if(mode==='backupChanged')input.expectedBackupHash='f'.repeat(64);
  if(mode==='owner')owner=await trialHash('google:other-account');
  if(mode==='consent')input.explicitApproval=false;
  if(mode==='conflict')f.conflict();if(mode==='broken')f.broken();
  const before=new Map(f.map);await assert.rejects(relinkGoogleSync(owner,input,secret,{storage:f.storage}));assert.deepEqual(f.map,before);
 }
});
test('absence of a previous cloud backup is archived as absence, never an invented history',async()=>{
 const f=await fixture();f.map.delete('jamd:backup:'+await trialHash(oldCode));await relinkGoogleSync(f.owner,f.input,secret,{storage:f.storage});
 const archive=JSON.parse([...f.map.entries()].find(([key])=>key.startsWith('jamd:account:sync-archive:'))[1]);assert.equal(archive.previousBackup,null);
});
test('competing relinks cannot both replace the same confirmed mapping; a successful retry is a no-op',async()=>{
 const f=await fixture(),results=await Promise.allSettled([relinkGoogleSync(f.owner,f.input,secret,{storage:f.storage}),relinkGoogleSync(f.owner,{...f.input,recoveryCode:third},secret,{storage:f.storage})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal([...f.map.keys()].filter(k=>k.startsWith('jamd:account:sync-archive:')).length,1);
 const linked=(await readGoogleSyncProfile(f.owner,secret,f.storage)).recoveryCode;assert.equal((await relinkGoogleSync(f.owner,{...f.input,recoveryCode:linked,expectedRecoveryHash:await trialHash(linked)},secret,{storage:f.storage})).changed,false);
});
test('HTTP relink requires authentication, same origin, bounded JSON and explicit consent without leaking codes',async()=>{
 const f=await fixture();let limits=0;const handler=createHandler({authenticate:async req=>{if(req.headers.get('authorization')!=='Bearer '+token)throw Object.assign(Error(),{status:401});return f.owner;},read:(owner,key)=>readGoogleSyncProfile(owner,key,f.storage),secret:()=>secret,limit:async()=>{limits++;},relink:(owner,input,key)=>relinkGoogleSync(owner,input,key,{storage:f.storage})});
 const request=(body,headers={})=>new Request('https://www.jamddmaj.com/api/account-sync',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,...headers},body:JSON.stringify(body)});
 assert.equal((await handler(request(f.input,{Authorization:''}))).status,401);
 assert.equal((await handler(request(f.input,{Origin:'https://evil.invalid'}))).status,400);
 assert.equal((await handler(request({...f.input,extra:'x'.repeat(1000)}))).status,400);
 assert.equal((await handler(request({...f.input,explicitApproval:false}))).status,400);
 const response=await handler(request(f.input));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(JSON.stringify(await response.json()).includes(original),false);assert.ok(limits>0);
});

test('real Account UI verifies the original encrypted backup, requires confirmation and switches Google without replacing local progress',
 {skip:!process.env.JAMDDMAJ_TEST_BROWSER_MODULE},async()=>{
 const f=await fixture(),html=await readFile(new URL('../index.html',import.meta.url),'utf8'),payload={format:'jamddmaj-backup',data:{chats:[],projects:[]}};
 const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(original),'PBKDF2',false,['deriveKey']);
 const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:new TextEncoder().encode('JamdDmaj encrypted backup v1'),iterations:120000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(payload)));
 const encrypted={iv:Buffer.from(iv).toString('base64'),data:Buffer.from(cipher).toString('base64')};f.map.set('jamd:backup:'+await trialHash(original),JSON.stringify({encrypted}));
 const handler=createHandler({authenticate:async req=>{assert.equal(req.headers.get('authorization'),'Bearer '+token);return f.owner;},secret:()=>secret,limit:async()=>{},read:(owner,value)=>readGoogleSyncProfile(owner,value,f.storage),relink:(owner,input,value)=>relinkGoogleSync(owner,input,value,{storage:f.storage})});
 const {chromium}=await import(process.env.JAMDDMAJ_TEST_BROWSER_MODULE),browser=await chromium.launch({headless:true,executablePath:process.env.JAMDDMAJ_TEST_BROWSER_EXECUTABLE});
 try {const page=await browser.newPage({viewport:{width:1365,height:900}});let writes=0;
  await page.addInitScript(({oldCode,token})=>{localStorage.setItem('jamdV3RecoveryCode',oldCode);localStorage.setItem('jamdV4AccountProfile',JSON.stringify({provider:'google',email:'fixture@example.invalid'}));sessionStorage.setItem('jamdWebTrialSession',token);},{oldCode,token});
  await page.route('https://www.jamddmaj.com/',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;
   if(path==='/api/account')return route.fulfill({json:{ok:true,google:{enabled:true,clientId:'fixture'}}});
   if(path==='/api/perps-identity')return route.fulfill({json:{ok:true,accountHash:f.owner,verifiedAt:Date.now()}});
   if(path==='/api/account-sync'){if(req.method()==='POST')writes++;const response=await handler(new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.method()==='POST'?{body:req.postData()}: {})}));return route.fulfill({status:response.status,json:await response.json()});}
   if(path==='/api/backup'&&req.method()==='POST'){assert.equal(JSON.parse(req.postData()).action,'restore');return route.fulfill({json:{ok:true,encrypted}});}
   if(req.method()!=='GET')return route.abort();return route.fulfill({status:503,json:{error:'UNRELATED_FIXTURE_ENDPOINT'}});
  });
  await page.goto('https://www.jamddmaj.com/',{waitUntil:'domcontentloaded'});await page.locator('#topSettingsBtn').click();await page.locator('[data-settings-panel=account]').click();await page.locator('#syncRelinkTitle').click();
  await page.locator('#syncRelinkCode').fill(original);await page.locator('#syncRelinkBtn').click();assert.equal(writes,0);
  await page.locator('#syncRelinkApproval').check();page.once('dialog',dialog=>dialog.dismiss());await page.locator('#syncRelinkBtn').click();await page.locator('#syncRelinkStatus').filter({hasText:'Cancelled'}).waitFor();assert.equal(writes,0);
  await page.locator('#syncRelinkCode').fill(original);await page.locator('#syncRelinkApproval').check();page.once('dialog',dialog=>dialog.accept());await page.locator('#syncRelinkBtn').click();await page.locator('#syncRelinkStatus').filter({hasText:'Original profile linked'}).waitFor();
  assert.equal(writes,1);assert.ok((await page.locator('#syncAccountId').textContent()).endsWith('BBBB'));assert.equal(await page.evaluate(()=>localStorage.getItem('jamdV3RecoveryCode')),oldCode);assert.equal(await page.locator('#syncRelinkCode').inputValue(),'');
 }finally{await browser.close();}
});
