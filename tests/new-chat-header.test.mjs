import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('new conversation focuses the composer without scrolling the app shell',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),body=html.slice(html.indexOf('function newChat()'),html.indexOf('function selectChat('));
 assert.match(body,/els\.prompt\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
 assert.match(body,/renderAll\(\)/);assert.doesNotMatch(body,/location\.reload|localStorage\.clear/);
});

test('chat shell constrains long sidebar history and reserves bounded header space',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/\.app\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/);
 assert.match(html,/\.sidebar\s*\{[^}]*min-height:\s*0/);
 assert.match(html,/\.conversation-heading\s*\{[^}]*flex:\s*0 1 210px/);
 assert.match(html,/\.top-actions\s*\{[^}]*flex:\s*1 1 0/);
 assert.match(html,/\.composer\s*\{[^}]*display:\s*flex/);
 assert.match(html,/\.composer textarea\s*\{[^}]*flex:\s*1 1 0/);
});

test('new conversation keeps header and actions in view on repeated desktop and mobile navigation',
 {skip:!process.env.JAMDDMAJ_TEST_BROWSER_MODULE},async()=>{
 const {chromium}=await import(process.env.JAMDDMAJ_TEST_BROWSER_MODULE),html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const browser=await chromium.launch({headless:true,executablePath:process.env.JAMDDMAJ_TEST_BROWSER_EXECUTABLE});
 try{for(const viewport of [{width:1306,height:638},{width:1365,height:660},{width:1365,height:900},{width:430,height:820}]){
  const page=await browser.newPage({viewport,reducedMotion:'reduce'});let posts=0;
  await page.addInitScript(()=>localStorage.setItem('jamdV2Chats',JSON.stringify(Array.from({length:30},(_,i)=>({id:'fixture-'+i,title:'Fixture conversation '+i,createdAt:Date.now(),updatedAt:Date.now(),messages:[]})))));
  await page.route('https://www.jamddmaj.com/',route=>route.fulfill({status:200,contentType:'text/html',body:html}));
  await page.route('**/api/**',route=>{if(route.request().method()!=='GET'){posts++;return route.abort();}return route.continue();});
  await page.goto('https://www.jamddmaj.com/',{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.fonts.ready);
  const inspect=()=>page.evaluate(()=>({headerTop:document.querySelector('.topbar').getBoundingClientRect().top,headerHeight:document.querySelector('.topbar').getBoundingClientRect().height,promptTop:document.querySelector('#promptInput').getBoundingClientRect().top,promptBottom:document.querySelector('#promptInput').getBoundingClientRect().bottom,promptWidth:document.querySelector('#promptInput').getBoundingClientRect().width,composerWidth:document.querySelector('.composer').getBoundingClientRect().width,shellBottom:document.querySelector('.app').getBoundingClientRect().bottom,composerHidden:document.querySelector('.composer-wrap').hidden,shellScroll:document.querySelector('.app').scrollTop,mainScroll:document.querySelector('.main').scrollTop,focus:document.activeElement.id}));
  const before=await inspect();for(let i=0;i<3;i++){
   if(viewport.width<600)await page.locator('#menuBtn').click();
   await page.locator('#newChatBtn').click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const after=await inspect();assert.ok(after.headerTop>=0,JSON.stringify({viewport,after}));assert.equal(after.shellScroll,before.shellScroll);assert.equal(after.mainScroll,before.mainScroll);assert.equal(after.focus,'promptInput');
   assert.equal(after.composerHidden,false);assert.ok(after.promptTop>=0&&after.promptBottom<=Math.min(viewport.height,after.shellBottom),JSON.stringify({viewport,after}));assert.ok(after.headerHeight<160,JSON.stringify({viewport,after}));
   assert.ok(after.promptWidth>after.composerWidth*.45,JSON.stringify({viewport,after}));
   await page.locator('#promptInput').fill('Visible composer test');assert.equal(await page.locator('#promptInput').inputValue(),'Visible composer test');
  }
  assert.equal(posts,0);await page.close();
 }}finally{await browser.close();}
});
