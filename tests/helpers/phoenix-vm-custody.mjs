// Only for the unfunded local VM rehearsal: fresh encrypted test identity,
// real scoped vault, private ledgers and an actual encrypted paused-restore proof.
// No networking, imported user key, balance, activation or transaction send.
import {mkdirSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault} from '../../lib/perps-custody-vault.js';
import {openPerpsAutomationControls} from '../../lib/perps-automation-controls.js';
import {openPerpsExecutionJournal} from '../../lib/perps-execution-journal.js';
import {openBotSwapJournal} from '../../lib/perps-bot-swap-journal.js';
import {openPhoenixExecutionJournal} from '../../lib/phoenix-execution-journal.js';
import {openPerpsPlatformFeeJournal} from '../../lib/perps-platform-fee-journal.js';
import {openPerpsPlatformFeePaymentJournal} from '../../lib/perps-platform-fee-payment-journal.js';
import {openPerpsBackupRegistry} from '../../lib/perps-backup-registry.js';
import {initializePerpsOperatorRecovery,createPerpsCustodyRecoveryArchive,restorePerpsCustodyRecoveryArchive} from '../../lib/perps-custody-recovery.js';
export async function openPhoenixVmCustody(root){
 const options={allowNonPosixForTests:process.platform==='win32'},opened=[];
 try{
  const directory=join(root,'wallets'),keys=join(root,'keys');mkdirSync(directory,{mode:0o700});mkdirSync(keys,{mode:0o700});
  const keyFile=join(keys,'master.key');createPerpsCustodyMasterKey(keyFile,options);
  const ownerAccountHash=createHash('sha256').update('UNFUNDED_LOCAL_VM_ONLY').digest('hex'),vault=openPerpsCustodyVault({directory,keyFile,...options});
  const identity=vault.createOrReadExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true});
  const controlsPath=join(root,'controls.sqlite'),journalPath=join(root,'journal.sqlite'),feesPath=join(root,'fees.sqlite'),paymentsPath=join(root,'payments.sqlite'),swapsPath=join(root,'swaps.sqlite'),phoenixPath=join(root,'phoenix.sqlite');
  const controls=openPerpsAutomationControls(controlsPath);opened.push(controls);
  const control=controls.provision({...identity,settings:{capital:100,loss:80,positions:2,margin:10,leverage:3,dailyTrades:5}});
  const riskJournal=openPerpsExecutionJournal(journalPath);opened.push(riskJournal);
  const feeJournal=openPerpsPlatformFeeJournal(feesPath,{entryJournal:riskJournal,controls});opened.push(feeJournal);
  const payments=openPerpsPlatformFeePaymentJournal(paymentsPath);opened.push(payments);
  const swapJournal=openBotSwapJournal(swapsPath,{...options,initialize:true,explicitOperatorApproval:true});opened.push(swapJournal);
  const journal=openPhoenixExecutionJournal(phoenixPath,{...options,initialize:true,explicitOperatorApproval:true});opened.push(journal);
  const backupRegistry=openPerpsBackupRegistry(join(root,'backup.sqlite'),options);opened.push(backupRegistry);
  for(const path of [controlsPath,journalPath,feesPath,paymentsPath,swapsPath,phoenixPath])chmodSync(path,0o600);
  const operatorDirectory=join(root,'operator'),operator=await initializePerpsOperatorRecovery({directory:operatorDirectory,...options});
  const archive=await createPerpsCustodyRecoveryArchive({directory,keyFile,recipient:operator.recipient,explicitOperatorApproval:true,requireRestoreProof:true,
   runtimePaths:{controlsPath,journalPath,feesPath,paymentsPath,swapsPath,phoenixPath,temporaryDirectory:root},...options});
  await backupRegistry.registerArchive(archive,{explicitOperatorApproval:true});
  const restored=await restorePerpsCustodyRecoveryArchive({ciphertext:archive.ciphertext,operatorDirectory,destinationDirectory:join(root,'paused-restore-proof'),explicitOperatorApproval:true,...options});
  backupRegistry.acceptRestoreProof({proofFile:restored.proofFile,explicitOperatorApproval:true});
  return {ownerAccountHash,identity,vault,controls,revision:control.revision,riskJournal,swapJournal,journal,backupRegistry,
   close(){for(const store of opened.reverse())store.close();opened.length=0;}};
 }catch(error){for(const store of opened.reverse())try{store.close();}catch{}throw error;}
}
