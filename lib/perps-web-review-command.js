// Narrow bounded REST transport for unsigned review records only. It cannot
// send a transaction, delete a financial record, issue Lua or take client URLs.
function fail(){throw Error('WEB_PERPS_REVIEW_STORAGE_UNAVAILABLE');}
export function createWebPerpsReviewCommand({url,token,fetchImpl}={}){
 let endpoint;try{endpoint=new URL(url);}catch{fail();}
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.hash||endpoint.search||!['','/'].includes(endpoint.pathname)
  ||typeof token!=='string'||token.length>8192||!/^[\x21-\x7e]+$/.test(token)||typeof fetchImpl!=='function')fail();
 return async command=>{
  if(!Array.isArray(command)||!/^jamd:web-perps:review:v1:[a-f0-9]{64}$/.test(command[1])
   ||!(command[0]==='GET'&&command.length===2||command[0]==='SET'&&command.length===6&&typeof command[2]==='string'&&command[2].length<=8192&&command[3]==='EX'&&command[4]===120&&command[5]==='NX'))fail();
  const encoded=JSON.stringify(command);if(encoded.length>20000)fail();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);let reader;
  try{
   const response=await fetchImpl(endpoint.href,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:encoded});
   if(response?.status!==200||response.redirected||!response.body||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))fail();
   const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>16384))fail();
   reader=response.body.getReader();const parts=[];let size=0;
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>16384)fail();parts.push(Buffer.from(part.value));}
   if(controller.signal.aborted)fail();const reply=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
   if(!reply||Array.isArray(reply)||Object.keys(reply).join(',')!=='result'||reply.result!==null&&typeof reply.result!=='string')fail();
   return reply.result;
  }catch{fail();}finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
 };
}
