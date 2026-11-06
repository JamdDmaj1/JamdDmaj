// Review-only service harness. Real private policy/backup/account proofs, but
// no signing or sending is permitted by any injected transport or vault method.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {chmodSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {openManualPerpsPolicyStore} from '../../lib/perps-manual-policy-store.js';
import {openPerpsBackupRegistry,PERPS_BACKUP_FEE_SCOPE_SCHEMA_SQL,PERPS_BACKUP_SWAP_SCOPE_SCHEMA_SQL} from '../../lib/perps-backup-registry.js';
import {readServerPerpsDailyAccount} from '../../lib/perps-server-daily-account.js';
import {createBotManualPerpsService} from '../../lib/perps-bot-manual-service.js';
export function entryServiceReviewHarness(root,f,opening,{risk,journal,ownerAccountHash,limits}){
 const who={ownerAccountHash,walletAddress:f.walletAddress},common={allowNonPosixForTests:process.platform==='win32',now:f.receiptOptions.now,monotonicNow:()=>0};
 const policyStore=openManualPerpsPolicyStore(join(root,'entry-policy.sqlite'),{...common,initialize:true});
 policyStore.save({...who,expectedRevision:null,limits,explicitApproval:true});
 const path=join(root,'entry-service-backup.sqlite');openPerpsBackupRegistry(path,common).close();
 const db=new DatabaseSync(path),archive='b'.repeat(64),at=common.now();
 try{
  // Accepted attestation persistence corpus only; this does not test an actual
  // encrypted archive. Restore/acceptance has its own cryptographic test corpus.
  db.exec(PERPS_BACKUP_FEE_SCOPE_SCHEMA_SQL+';'+PERPS_BACKUP_SWAP_SCOPE_SCHEMA_SQL);
  db.prepare("INSERT INTO perps_backup_challenges(archive,token_hash,created,expires,bindings,status) VALUES(?,?,?,?,?,'ACCEPTED')").run(archive,'c'.repeat(64),at,at+86400000,JSON.stringify([who]));
  db.prepare('INSERT INTO perps_verified_backups VALUES(?,?,?,?,?)').run(ownerAccountHash,f.walletAddress,archive,randomUUID(),at);
  db.prepare('INSERT INTO perps_backup_fee_scope VALUES(?,1)').run(archive);db.prepare('INSERT INTO perps_backup_swap_scope VALUES(?,1)').run(archive);
 }finally{db.close();}
 chmodSync(path,0o600);const backupRegistry=openPerpsBackupRegistry(path,common);
 const accountRequest=async(method,params)=>{
  if(method==='getMultipleAccounts')return {context:{slot:500000},value:params[0].map(key=>opening.before.get(key)??null)};
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSlot')return 500000;if(method==='getBlocks')return [68000];if(method==='getFirstAvailableBlock')return 100;
  if(method==='getBlockTime')return at/1000-(params[0]===500000?5:172800);
  if(method==='getSignaturesForAddress')return [];throw Error('UNEXPECTED_ACCOUNT_RPC');
 };
 const forbidden=()=>assert.fail('Review cannot sign, send, or collect fees');
 const vault={describe:()=>({...who,exclusive:true}),signManualEntry:forbidden,signNativeClose:forbidden,signCloseConversion:forbidden};
 const state={...who,enabled:false,paused:true,revision:'1'};
 const service=createBotManualPerpsService({journal:risk,swapJournal:journal,policyStore,backupRegistry,
  controls:{readForOwner:({ownerAccountHash:owner})=>owner===ownerAccountHash?state:null},vault,
  readAccount:()=>readServerPerpsDailyAccount(who,{request:accountRequest,...common,journal:risk}),
  rpcRequest:(method,params)=>{
   if(['getSignatureStatuses','getTransaction'].includes(method))return f.request(method,params);
   if(method==='getMultipleAccounts'&&params[0].length===2&&params[0][0]===f.u.address)
    return Promise.resolve({context:{slot:params[1].minContextSlot+1},value:params[0].map(key=>f.before.get(key))});
   return opening.request(method,params);
  },
  builderRequest:opening.builderRequest,feeJournal:{recordConsent:forbidden},platformFees:{assertActivationReadiness:async()=>{},status:()=>({dueUnits:'0',pendingCount:0,failedCount:0})},
  hasPendingSwap:wallet=>journal.pending(wallet).length>0,isRunning:()=>true,fetchImpl:forbidden,readFinalizedAccount:forbidden,...common});
 return {service,who,close(){backupRegistry.close();policyStore.close();}};
}
