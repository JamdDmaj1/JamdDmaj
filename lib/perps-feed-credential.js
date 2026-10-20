// Operator-only dedicated read-feed credential. Never a wallet, cron/admin
// secret, execution key, public endpoint, or automatically rotating value.
import {randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {checkPrivateRecoveryPath as check,makePrivateRecoveryDirectory as mkdir,readPrivateRecoveryFile as read,writePrivateRecoveryFile as write} from './perps-recovery-private-files.js';
export const PERPS_FEED_VARIABLE='JAMDDMAJ_CLIENT_FEED_TOKEN';
function fail(){throw Error('PERPS_FEED_CREDENTIAL_UNAVAILABLE');}
export function readDedicatedPerpsFeedCredential({directory,allowNonPosixForTests=false}={}){
 directory=check(directory,true,allowNonPosixForTests).path;
 const text=read(join(directory,'client-feed.env'),256,allowNonPosixForTests).toString('utf8');
 const match=/^JAMDDMAJ_CLIENT_FEED_TOKEN=([a-f0-9]{64})\n$/.exec(text);if(!match)fail();return match[1];
}
export function provisionDedicatedPerpsFeedCredential({directory,explicitCredentialApproval=false,allowNonPosixForTests=false}={}){
 if(explicitCredentialApproval!==true)fail();
 try{
  directory=existsSync(directory)?check(directory,true,allowNonPosixForTests).path:mkdir(directory,allowNonPosixForTests);
  const path=join(directory,'client-feed.env'),reused=existsSync(path);
  if(!reused)write(path,PERPS_FEED_VARIABLE+'='+randomBytes(32).toString('hex')+'\n',allowNonPosixForTests);
  readDedicatedPerpsFeedCredential({directory,allowNonPosixForTests});
  return Object.freeze({stage:'DEDICATED_READ_FEED_CREDENTIAL_READY',variable:PERPS_FEED_VARIABLE,secretFile:path,reused,
   activationRequested:false,tradingEnabled:false,readyForSigning:false});
 }catch{fail();}
}
