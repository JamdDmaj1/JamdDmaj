// Narrow one-use custody capability for an exact simulated swap or transfer.
// Distinct engine grants and reviewed stages cannot be used interchangeably.
import {consumeWebSwapGrant} from './web-swap-engine.js';
import {requireBotSwapJournal,requireBotSwapClaim} from './perps-bot-swap-journal.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
import {consumeWalletTransferGrant} from './wallet-transfer-engine.js';
const grants=new WeakMap();
function fail(){throw Error('BOT_SWAP_CUSTODY_NOT_AUTHORIZED');}
export async function authorizeBotSwapCustody({engineGrant,review,journal,ownerAccountHash,controls,backupRegistry,assertUncontended,transfer=false}={}){
 requireBotSwapJournal(journal);if(typeof controls?.read!=='function'||typeof backupRegistry?.readVerified!=='function'||typeof assertUncontended!=='function')fail();
 if(transfer?review.stage!=='BOT_TRANSFER_REVIEW':review.stage!=='BOT_SWAP_REVIEW')fail();
 const approval=await (transfer?consumeWalletTransferGrant:consumeWebSwapGrant)(engineGrant,review.walletAddress),who={ownerAccountHash,walletAddress:review.walletAddress};
 const claim=journal.claim({id:review.id,...who,revision:review.controlRevision,review,message:approval.message});
 function revalidate(){
  approval.current();const row=requireBotSwapClaim(claim,journal),state=controls.read(who);
  if(row.owner!==ownerAccountHash||row.wallet!==review.walletAddress||row.revision!==review.controlRevision||row.review!==JSON.stringify(review)
   ||row.message!==Buffer.from(approval.message).toString('base64')||state.enabled!==false||state.paused!==true||state.revision!==review.controlRevision)fail();
  assertUncontended(who);
  const proof=requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who);if(proof.botSwapStateIncluded!==true)fail();
 }
 try{revalidate();const grant=Object.freeze({id:claim.id});grants.set(grant,{...who,message:Uint8Array.from(approval.message),revalidate,used:false});return {grant,claim};}
 catch(error){journal.abortUnsignedOrUnsent(claim);throw error;}
}
export function consumeBotSwapCustody(grant){const p=grants.get(grant);if(!p||p.used)fail();p.used=true;p.revalidate();return p;}
