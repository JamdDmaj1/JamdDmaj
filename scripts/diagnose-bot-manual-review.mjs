// Read-only chain/simulation probe. No custody key, signer, executor, or send RPC.
import {readFileSync,realpathSync,lstatSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createServerPerpsReadOnlyRpc} from '../lib/perps-server-rpc.js';
import {prepareInspectedPerpsManualOrder} from '../lib/perps-manual-preparation.js';
import {requirePerpsPlatformFeeRecipient} from '../lib/perps-platform-fee-payment.js';
import {openPerpsBackupRegistry} from '../lib/perps-backup-registry.js';
import {decodeServerPerpsEnvelope} from '../lib/perps-server-envelope.js';
import {resolveServerPerpsPreparationEnvelope} from '../lib/perps-server-preparation.js';
import {decodeServerPerpsPreSwap,minimumServerPerpsCollateralOutput} from '../lib/perps-server-preswap.js';
const wallet='3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T';
const env=Object.fromEntries(readFileSync('/proc/'+process.argv[2]+'/environ','utf8').split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
const request=createServerPerpsReadOnlyRpc({url:env.JAMDDMAJ_PERPS_RPC_URL||'https://api.mainnet-beta.solana.com'});
let stage='owner';const stores=[];let registry;
try{
 const controls=new DatabaseSync('/var/lib/private/jamddmaj-perps-controls/controls.sqlite',{readOnly:true});stores.push(controls);
 const who=controls.prepare('SELECT owner FROM perps_automation_controls WHERE wallet=?').get(wallet);if(!who)throw Error('OWNER_MISSING');
 stage='backup';const dbPath=realpathSync('/var/lib/private/jamddmaj-perps-runtime/backup.sqlite');
 console.log(JSON.stringify({stage:'path-check',canonical:dbPath,ownerMatches:lstatSync(dbPath).uid===process.getuid()}));
 registry=openPerpsBackupRegistry(dbPath);const proof=registry.readVerified({ownerAccountHash:who.owner,walletAddress:wallet});
 console.log(JSON.stringify({stage,verified:proof.backupVerified,feeScope:proof.platformFeeStateIncluded}));
 stage='fee-recipient';await requirePerpsPlatformFeeRecipient({request});console.log(JSON.stringify({stage,ok:true}));
 stage='reference';const market=await fetch('https://perps-api.jup.ag/v1/market-stats?mint=3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh').then(r=>r.json());
 const referencePrice=Number(market.price).toFixed(6);
 stage='unsigned-order';const side=process.argv[3]==='SHORT'?'SHORT':'LONG';const review=await prepareInspectedPerpsManualOrder({asset:'BTC',side,margin:'10',leverage:'3',referencePrice},wallet,
  {rpcRequest:request,builderRequest:async(url,options)=>{if(url.includes('/execute'))throw Error('FORBIDDEN_EXECUTION');const body=JSON.parse(options.body);body.maxSlippageBps='25';const r=await fetch(url,{...options,body:JSON.stringify(body)});console.log(JSON.stringify({stage:'builder-http',status:r.status}));
   if(r.ok){const v=await r.clone().json(),envelope=decodeServerPerpsEnvelope(v.serializedTxBase64,wallet),resolved=await resolveServerPerpsPreparationEnvelope(v,wallet,{request});
    for(const ix of envelope.instructions){const b=Buffer.from(ix.dataBase64,'base64');if(b.subarray(0,8).toString('hex')==='a47e44b6dfa640b7')console.log(JSON.stringify({stage:'unsigned-core',length:b.length,size:b.readBigUInt64LE(8).toString(),collateralFlag:b[16],collateral:b[16]===1?b.readBigUInt64LE(17).toString():null,side:b[16]===1?b[25]:b[17],ledgerPlaceholder:resolved.resolvedKeys[ix.accounts[14]]}));}
    for(const ix of envelope.instructions)if(Buffer.from(ix.dataBase64,'base64').subarray(0,8).toString('hex')==='a47e44b6dfa640b7'){
     const index=ix.accounts[14],address=resolved.resolvedKeys[index];
     const accounts=await request('getMultipleAccounts',[[address],{encoding:'base64',commitment:'confirmed'}]);const a=accounts.value[0];
     const b=a?.data?Buffer.from(a.data[0],'base64'):Buffer.alloc(0);
     console.log(JSON.stringify({stage:'optional-ledger',index,staticCount:envelope.staticKeys.length,readonlyUnsigned:envelope.readonlyUnsigned,owner:a?.owner,executable:a?.executable,length:b.length,discriminator:b.subarray(0,8).toString('hex'),data:b.toString('base64')}));
    }
    for(const ix of envelope.instructions)if(Buffer.from(ix.dataBase64,'base64').subarray(0,8).toString('hex')==='c52656a5c71726ea')console.log(JSON.stringify({stage:'unsigned-swap-bounds',...decodeServerPerpsPreSwap(ix.dataBase64),required:minimumServerPerpsCollateralOutput({marginUsd:'10',referencePrice,maxSlippageBps:50},8)}));
   }return r;}});
 console.log(JSON.stringify({stage,ok:true,readyForSigning:review.readyForSigning}));
}catch(e){console.log(JSON.stringify({stage,ok:false,code:/^[A-Z_]{1,100}$/.test(e.message)?e.message:'DIAGNOSTIC_UNAVAILABLE',frames:String(e.stack).split('\n').slice(1,5)}));process.exitCode=1;}
finally{registry?.close();stores.forEach(d=>d.close());}
