// Loopback HTTP boundary for a TLS reverse proxy. No financial transport or
// custody files are reachable from the public health route.
import {createServer} from 'node:http';
import {isIP} from 'node:net';
export function createPerpsControlHttpServer({handler,webOperationStatusHandler=null,now=Date.now,maxConcurrent=8,trustLoopbackProxy=false,readCapabilities=null}={}){
 if(webOperationStatusHandler!==null&&typeof webOperationStatusHandler!=='function')throw Error('PERPS_HTTP_NOT_CONFIGURED');
 if(typeof handler!=='function'||typeof now!=='function'||typeof trustLoopbackProxy!=='boolean'||readCapabilities!==null&&typeof readCapabilities!=='function'||!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>32)throw Error('PERPS_HTTP_NOT_CONFIGURED');
 const peers=new Map();let active=0;
 const server=createServer({requestTimeout:5000,headersTimeout:5000,keepAliveTimeout:5000,maxHeaderSize:8192,connectionsCheckingInterval:1000},(req,res)=>{
  const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  if(active>=maxConcurrent){json(503,{error:{code:'service-busy'}});req.resume();return;}
  // Socket-based by default. A loopback reverse proxy may be explicitly trusted
  // only when it replaces client-supplied forwarding headers. Authenticated
  // per-account quotas remain separately enforced in SQLite in either mode.
  let peer=req.socket.remoteAddress||'unknown';
  if(trustLoopbackProxy&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)){
   const forwarded=typeof req.headers['x-forwarded-for']==='string'?req.headers['x-forwarded-for'].split(',')[0].trim():'';if(isIP(forwarded))peer=forwarded;
  }
  const bucket=Math.floor(now()/60000),previous=peers.get(peer);
  if(previous?.bucket>bucket||previous?.bucket===bucket&&previous.count>=120){json(429,{error:{code:'rate-limit'}});req.resume();return;}
  if(peers.size>=1024&&!peers.has(peer))peers.delete(peers.keys().next().value);
  peers.set(peer,{bucket,count:previous?.bucket===bucket?previous.count+1:1});
  active++;
  const run=async()=>{
   if(typeof req.url!=='string'||req.url.length>1024||!req.url.startsWith('/')||req.url.startsWith('//')){json(400,{error:{code:'invalid-request'}});req.resume();return;}
   const url=new URL(req.url,'http://127.0.0.1');
   if(url.pathname==='/health'&&req.method==='GET'&&!url.search){
    const capabilities=readCapabilities?readCapabilities():{mode:'controls-only',tradingEnabled:false,executionAvailable:false,custodyProvisioningAvailable:false};
    if(!capabilities||!['controls-only','execute'].includes(capabilities.mode)||['tradingEnabled','executionAvailable','custodyProvisioningAvailable'].some(key=>typeof capabilities[key]!=='boolean'))throw Error();
    req.resume();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
    res.end(JSON.stringify({ok:true,mode:capabilities.mode,tradingEnabled:capabilities.tradingEnabled,executionAvailable:capabilities.executionAvailable,custodyProvisioningAvailable:capabilities.custodyProvisioningAvailable}));return;
   }
   const statusRoute=url.pathname==='/api/perps-operation-status'&&webOperationStatusHandler!==null;
   if(url.pathname!=='/v1/automation'&&!statusRoute){json(404,{error:{code:'not-found'}});req.resume();return;}
   const authorizationFields=req.rawHeaders.filter((_value,index)=>index%2===0&&req.rawHeaders[index].toLowerCase()==='authorization').length;
   if(authorizationFields>1){json(400,{error:{code:'invalid-request'}});req.resume();return;}
   const maximum=statusRoute?1024:4096;
   const length=req.headers['content-length'];if(length!==undefined&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>maximum)){json(413,{error:{code:'request-too-large'}});req.resume();return;}
   const parts=[];let size=0;
   for await(const chunk of req){size+=chunk.byteLength;if(size>maximum){json(413,{error:{code:'request-too-large'}});req.resume();return;}parts.push(Buffer.from(chunk));}
   const headers=new Headers();for(const [name,value]of Object.entries(req.headers))if(typeof value==='string')headers.set(name,value);
   const options={method:req.method,headers};if(!['GET','HEAD'].includes(req.method)&&size)options.body=Buffer.concat(parts,size);
   // Canonical public same-origin request behind loopback TLS proxy. Never
   // trust Host/forwarded-host to select an origin or external destination.
   const target=statusRoute?new URL(url.pathname+url.search,'https://www.jamddmaj.com'):url;
   const response=await (statusRoute?webOperationStatusHandler:handler)(new Request(target,options)),body=Buffer.from(await response.arrayBuffer());
   if(body.length>16384)throw Error();for(const [name,value]of response.headers)if(name.toLowerCase()!=='set-cookie')res.setHeader(name,value);
   res.writeHead(response.status);res.end(body);
  };
  run().catch(()=>{if(!res.headersSent)json(503,{error:{code:'service-unavailable'}});else res.destroy();}).finally(()=>{active--;});
 });
 server.maxConnections=32;return server;
}
