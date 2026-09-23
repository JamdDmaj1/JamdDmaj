import test from 'node:test';
import assert from 'node:assert/strict';
import {setupTerminalLayout} from '../lib/terminal-layout.js';

for(const language of ['es','en'])test(`finance navigation preserves accounts and hides unfinished features (${language})`,()=>{
  const all=[];
  function node(tag='div'){
    const n={tag,children:[],attrs:{},style:{},append(...items){this.children.push(...items)},insertBefore(item){this.children.push(item)},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,v){this[k]=v},focus(){this.focused=true},closest(){return this.section}};
    all.push(n);return n;
  }
  const main=node(),heading=node(),intro=node(),search=node(),stats=node(),notice=node(),chart=node(),history=node(),funding=node(),manual=node(),connection=node(),badge=node();
  heading.nextElementSibling=intro;stats.previousElementSibling=notice;manual.nextElementSibling=connection;
  main.querySelector=s=>({'h1':heading,'.stats':stats,'.grid':chart,'.badge':badge}[s]);
  const ids={searchForm:{section:search},history:{section:history},deposit:{section:funding},'manual-review-symbol':{section:manual}};
  const doc={head:node(),body:node(),querySelector:()=>main,createElement:node,getElementById:id=>({closest:()=>ids[id].section})};
  setupTerminalLayout(language,doc);
  const find=id=>all.find(n=>n.id===id),pages=all.filter(n=>n.attrs.role==='tabpanel');
  assert.equal(pages.length,4);
  assert.equal(find('practice-menu').open,false);
  assert.equal(pages.filter(n=>!n.hidden).length,1);
  find('tab-assets').onclick();
  assert.deepEqual(pages.filter(n=>!n.hidden).map(n=>n.id),['terminal-assets']);
  assert.ok(find('terminal-assets').children.includes(connection));
  assert.ok(find('terminal-assets').children.includes(funding));
  assert.ok(find('terminal-futures').children.includes(manual));
  assert.equal(find('practice-menu').hidden,true);
  assert.equal(find('tab-assets').tabIndex,0);
  assert.equal(find('tab-home').tabIndex,-1);
  assert.equal(find('terminal-trade'),undefined);
  assert.ok(doc.head.children[0].textContent.includes('[hidden]{display:none!important}'));
  const nav=doc.body.children[0];
  nav.keydown({target:find('tab-assets'),key:'Home',preventDefault(){}});
  assert.equal(find('terminal-home').hidden,false);
  assert.equal(find('tab-home').focused,true);
});
