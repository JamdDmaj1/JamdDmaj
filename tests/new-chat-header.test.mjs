import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('new conversation focuses the composer without scrolling the app shell',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),body=html.slice(html.indexOf('function newChat()'),html.indexOf('function selectChat('));
 assert.match(body,/els\.prompt\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
 assert.match(body,/renderAll\(\)/);assert.doesNotMatch(body,/location\.reload|localStorage\.clear/);
});

test('new conversation keeps header and actions in view on repeated desktop and mobile navigation',
 {skip:!process.env.JAMDDMAJ_TEST_BROWSER_MODULE},async()=>{
 const {chromium}=await import(process.env.JAMDDMAJ_TEST_BROWSER_MODULE),html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const browser=await chromium.launch({headless:true,executablePath:process.env.JAMDDMAJ_TEST_BROWSER_EXECUTABLE});
 try{for(const viewport of [{width:1365,height:660},{width:1365,height:900},{width:430,height:820}]){
  const page=await browser.newPage({viewport,reducedMotion:'reduce'});let posts=0;
  await page.route('https://www.jamddmaj.com/',route=>route.fulfill({status:200,contentType:'text/html',body:html}));
  await page.route('**/api/**',route=>{if(route.request().method()!=='GET'){posts++;return route.abort();}return route.continue();});
  await page.goto('https://www.jamddmaj.com/',{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.fonts.ready);
  const inspect=()=>page.evaluate(()=>({headerTop:document.querySelector('.topbar').getBoundingClientRect().top,shellScroll:document.querySelector('.app').scrollTop,mainScroll:document.querySelector('.main').scrollTop,focus:document.activeElement.id}));
  const before=await inspect();for(let i=0;i<3;i++){
   if(viewport.width<600)await page.locator('#menuBtn').click();
   await page.locator('#newChatBtn').click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const after=await inspect();assert.ok(after.headerTop>=0,JSON.stringify({viewport,after}));assert.equal(after.shellScroll,before.shellScroll);assert.equal(after.mainScroll,before.mainScroll);assert.equal(after.focus,'promptInput');
  }
  assert.equal(posts,0);await page.close();
 }}finally{await browser.close();}
});
