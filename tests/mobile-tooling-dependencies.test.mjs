import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {expand} from 'brace-expansion';
import plist from 'plist';

test('native tooling lock retains the reviewed same-line xmldom and brace-expansion security patches',()=>{
 const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
 for(const [name,minimum]of [['@xmldom/xmldom',[0,9,12]],['brace-expansion',[5,0,12]]]){
  const item=lock.packages['node_modules/'+name],version=item.version.split('.').map(Number);
  assert.equal(version[0],minimum[0]);assert.equal(version[1],minimum[1]);assert.ok(version[2]>=minimum[2]);
  assert.equal(item.dev,true);assert.ok(item.resolved.startsWith('https://registry.npmjs.org/'));assert.match(item.integrity,/^sha512-/);
 }
});

test('patched XML parser preserves the Android manifest and plist round trip without altering project files',()=>{
 const manifest=readFileSync(new URL('../android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
 const doc=new DOMParser().parseFromString(manifest,'text/xml');assert.equal(doc.documentElement.nodeName,'manifest');
 const output=new XMLSerializer().serializeToString(doc);assert.match(output,/<application\b/);assert.match(output,/android\.permission\.INTERNET/);
 const value={CFBundleName:'JamdDmaj',CFBundleIdentifier:'com.jamddmaj.fixture',CFBundleVersion:'155',LSApplicationQueriesSchemes:['phantom','solflare']};
 assert.deepEqual(plist.parse(plist.build(value)),value);
});

test('mixed-case HTML raw-text endings no longer amplify serialized output',()=>{
 for(const tag of ['script','style','textarea','title']){
  const source='<html><body>'+('<'+tag+'>x</'+tag.toUpperCase()+'>').repeat(128)+'</body></html>';
  const output=new XMLSerializer().serializeToString(new DOMParser().parseFromString(source,'text/html'));
  assert.ok(output.length<=source.length*2,tag+' output amplification');
 }
});

test('patched brace expansion preserves native path patterns and bounds adversarial nesting and rewrites',()=>{
 assert.deepEqual(expand('android/{app,plugins}/src'),['android/app/src','android/plugins/src']);
 assert.deepEqual(expand('assets/icon-{1..3}.png'),['assets/icon-1.png','assets/icon-2.png','assets/icon-3.png']);
 for(const input of ['{'.repeat(4000)+'a,b'+'}'.repeat(4000),'{a}'+'}'.repeat(8192)+',z}']){
  let output;assert.doesNotThrow(()=>{output=expand(input,{max:4,maxLength:16384,maxDepth:16,maxRewrites:8});});
  assert.ok(Array.isArray(output));assert.ok(output.length<=4);
 }
});
