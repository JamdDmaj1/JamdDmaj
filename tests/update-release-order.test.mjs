import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler,{FALLBACK_VERSION} from '../api/status.js';
const compare=(left,right)=>{const a=left.split('.').map(Number),b=right.split('.').map(Number);for(let index=0;index<3;index++){const l=a[index]||0,r=b[index]||0;if(l!==r)return l-r}return 0};
test('updates choose the highest published APK version, not the last workflow to finish',async()=>{
 const original=globalThis.fetch;
 const release=(tag,changes={})=>({tag_name:tag,name:tag,draft:false,prerelease:false,html_url:'https://github.com/JamdDmaj1/JamdDmaj/releases/tag/'+tag,assets:[{name:'JamdDmaj-AI.apk',browser_download_url:'https://github.com/JamdDmaj1/JamdDmaj/releases/download/'+tag+'/JamdDmaj-AI.apk'}],...changes});
 globalThis.fetch=async()=>Response.json([release('v1.38.11'),release('v1.38.12'),release('v1.38.13',{draft:true}),release('v1.38.14',{assets:[]})]);
 try{
  const r=await handler(new Request('https://www.jamddmaj.com/api/status'));const v=await r.json();
  const published='1.38.12';
  const expected=compare(published,FALLBACK_VERSION)>=0?published:FALLBACK_VERSION;
  assert.equal(v.latestVersion,expected);
  if(expected===published)assert.match(v.apkUrl,/v1\.38\.12/);else assert.match(v.apkUrl,/releases\/latest\/download\/JamdDmaj-AI\.apk/);
 }finally{globalThis.fetch=original;}
});
