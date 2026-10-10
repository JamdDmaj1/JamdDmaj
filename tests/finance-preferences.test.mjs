import test from 'node:test';
import assert from 'node:assert/strict';
import {readAppearance,setupFinancePreferences} from '../lib/finance-preferences.js';
test('appearance rejects invalid storage and keeps safe defaults',()=>{
  assert.equal(readAppearance({getItem:()=>'{bad'}).theme,'dark');
  assert.deepEqual(readAppearance({getItem:()=>JSON.stringify({theme:'unexpected',compact:'true',motion:false})}),{theme:'dark',compact:false,motion:false});
});
test('theme and density controls persist preferences without touching wallet data',()=>{
  const all=[],saved=[];const node=()=>{const n={children:[],attrs:{},append(...v){this.children.push(...v)},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,fn){this[k]=fn}};all.push(n);return n;};
  const root=node();setupFinancePreferences(node(),'es',{createElement:node,documentElement:root},{getItem:()=>null,setItem:(...v)=>saved.push(v)});
  const theme=all.find(n=>n.id==='finance-theme');theme.value='light';theme.change();
  assert.equal(root.attrs['data-finance-theme'],'light');
  const compact=all.find(n=>n.type==='checkbox');compact.checked=true;compact.change();
  assert.equal(root.attrs['data-finance-compact'],'true');
  assert.ok(saved.every(([key])=>key==='jamdFinanceAppearance'));
});
