// Local UI preview. Only public read-only market routes are forwarded.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('www');
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(req.method!=='GET'){res.writeHead(405).end();return;}
    if(url.pathname.startsWith('/api/')){
      if(!['/api/token-prices','/api/market-asset'].includes(url.pathname)){res.writeHead(404).end();return;}
      const upstream=await fetch('https://www.jamddmaj.com'+url.pathname+url.search,{signal:AbortSignal.timeout(20000)});
      res.writeHead(upstream.status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(await upstream.text());return;
    }
    const path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
    const body=await readFile(path);res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png'})[extname(path)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);
  }catch{res.writeHead(503).end('Preview resource unavailable');}
}).listen(8772,'127.0.0.1',()=>console.log('Read-only preview: http://127.0.0.1:8772/private-simulator.html#lang=es'));
