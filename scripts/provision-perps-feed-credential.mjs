import {provisionDedicatedPerpsFeedCredential} from '../lib/perps-feed-credential.js';
try{
 const [directory,approval,...extra]=process.argv.slice(2);if(approval!=='--explicit-read-feed-credential-approval'||extra.length)throw Error();
 console.log(JSON.stringify(provisionDedicatedPerpsFeedCredential({directory,explicitCredentialApproval:true})));
}catch{console.error('PERPS_FEED_CREDENTIAL_UNAVAILABLE');process.exitCode=1;}
