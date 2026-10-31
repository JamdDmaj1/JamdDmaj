import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/status.js';
test('updates choose the highest published APK version, not the last workflow to finish',async()=>{
 const original=globalThis.fetch;
 const release=(tag,changes={})=>({tag_name:tag,name:tag,draft:false,prerelease:false,html_url:'https://github.com/JamdDmaj1/JamdDmaj/releases/tag/'+tag,assets:[{name:'JamdDmaj-AI.apk',browser_download_url:'https://github.com/JamdDmaj1/JamdDmaj/releases/download/'+tag+'/JamdDmaj-AI.apk'}],...changes});
 globalThis.fetch=async()=>Response.json([release('v1.38.11'),release('v1.38.12'),release('v1.38.13',{draft:true}),release('v1.38.14',{assets:[]})]);
 try{const r=await handler(new Request('https://www.jamddmaj.com/api/status'));const v=await r.json();assert.equal(v.latestVersion,'1.38.12');assert.match(v.apkUrl,/v1\.38\.12/);}finally{globalThis.fetch=original;}
});
