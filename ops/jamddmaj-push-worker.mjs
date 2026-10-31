import {readFile} from 'node:fs/promises';
const directory=process.env.CREDENTIALS_DIRECTORY;
if(!directory)throw Error('Push worker credential unavailable');
const secret=(await readFile(directory+'/worker-secret','utf8')).trim();
if(!/^[a-f0-9]{64}$/.test(secret))throw Error('Push worker credential invalid');
try{
 const response=await fetch('https://www.jamddmaj.com/api/push-dispatch',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+secret},signal:AbortSignal.timeout(58000)});
 console.log('push-dispatch HTTP '+response.status);
 if(response.ok){const summary=await response.json();if(Number.isInteger(summary.processed)&&Number.isInteger(summary.accepted))console.log('push-dispatch processed='+summary.processed+' accepted='+summary.accepted);}
 if(!response.ok)process.exitCode=1;
}catch{console.error('push-dispatch unavailable');process.exitCode=1;}
