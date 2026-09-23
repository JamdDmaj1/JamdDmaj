import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../funding-ui.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export function','function');
for(const language of ['es','en'])test(`funding opens official pages without transactions (${language})`,async()=>{
 const added=[], replacements={},nodes={};
 const element=()=>({style:{},textContent:'',append(...v){added.push(...v)},addEventListener(k,v){this[k]=v},replaceWith(v){replacements[this.id]=v}});
 const panel={querySelector:()=>element(),append(...v){added.push(...v)}};
 for(const id of ['deposit','withdraw','fundingStatus'])nodes[id]={...element(),id,closest:()=>panel};
 let calls=[],checks=0;
 const context=vm.createContext({Capacitor:{isNativePlatform:()=>true},Browser:{open:async args=>calls.push(args.url)},
 document:{getElementById:id=>nodes[id],createElement:element,querySelector:()=>({before:v=>added.push(v)})}});
 vm.runInContext(source,context);context.setupFunding(language,{click:()=>checks++,scrollIntoView:()=>{}});
 for(const [id,path] of [['deposit','recharge'],['withdraw','withdraw']]){
  const link=replacements[id];assert.equal(link.href,`https://www.bitget.com/asset/${path}`);assert.equal(link.rel,'noopener noreferrer');
  let prevented=false;await link.click({preventDefault(){prevented=true}});assert.equal(prevented,true);
 }
 assert.equal(calls.length,2);assert.equal(checks,0);
 assert.ok(added.some(n=>n.textContent.includes(language==='es'?'ficticio':'virtual')));
 assert.doesNotMatch(source,/fetch\(|\/api\//);
});
