// Emits ONLY an encrypted archive of freshly-created UNFUNDED temporary test
// wallets/databases. No network, real custody paths, signing or submissions.
import {mkdtempSync,mkdirSync,chmodSync,rmSync,writeSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault} from '../../lib/perps-custody-vault.js';
import {openPerpsAutomationControls} from '../../lib/perps-automation-controls.js';
import {openPerpsExecutionJournal} from '../../lib/perps-execution-journal.js';
import {createPerpsCustodyRecoveryArchive} from '../../lib/perps-custody-recovery.js';
let root,controls,journal;
try{
 if(process.platform==='win32'||process.env.JAMDDMAJ_RECOVERY_FIXTURE_ONLY!=='UNFUNDED'||process.argv.length!==3||!/^age1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/.test(process.argv[2]))throw Error();
 root=mkdtempSync(join(tmpdir(),'jamd-offhost-unfunded-'));chmodSync(root,0o700);
 const directory=join(root,'wallets'),keys=join(root,'keys'),keyFile=join(keys,'master.key'),controlsPath=join(root,'controls.sqlite'),journalPath=join(root,'journal.sqlite');
 mkdirSync(directory,{mode:0o700});mkdirSync(keys,{mode:0o700});createPerpsCustodyMasterKey(keyFile);
 const ownerAccountHash='f'.repeat(64),wallet=openPerpsCustodyVault({directory,keyFile}).createOrReadExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true});
 controls=openPerpsAutomationControls(controlsPath);controls.provision({ownerAccountHash,walletAddress:wallet.walletAddress,settings:{capital:100,loss:80,positions:2,margin:10,leverage:3,dailyTrades:5}});
 journal=openPerpsExecutionJournal(journalPath);const now=Date.now();
 journal.reserve({walletAddress:wallet.walletAddress,signalId:'UNFUNDED-OFFHOST-FIXTURE',reservationId:'UNFUNDED-OFFHOST-FIXTURE',marginUsd:10,limits:{capitalUsd:100,dailyLossUsd:80,positions:2,dailyTrades:5},snapshot:{walletAddress:wallet.walletAddress,network:'solana-mainnet',balancesComplete:true,observedAt:now,day:new Date(now).toISOString().slice(0,10),availableUsdcUnits:'100000000',allocatedUsdcUnits:'0',lossTodayUsdcUnits:'0',openPositions:0,tradesToday:0}});
 journal.beginSigning('UNFUNDED-OFFHOST-FIXTURE'); // Durable unknown hold only; NEVER signs.
 for(const path of [controlsPath,journalPath])chmodSync(path,0o600);
 const archive=await createPerpsCustodyRecoveryArchive({directory,keyFile,recipient:process.argv[2],explicitOperatorApproval:true,runtimePaths:{controlsPath,journalPath,temporaryDirectory:root}});
 const bytes=Buffer.from(archive.ciphertext);let offset=0;while(offset<bytes.length)offset+=writeSync(1,bytes,offset,bytes.length-offset);
}catch{console.error('UNFUNDED_OFFHOST_RECOVERY_FIXTURE_FAILED');process.exitCode=1;}
finally{
 try{controls?.close();journal?.close();}finally{
  if(root&&dirname(root)===tmpdir()&&basename(root).startsWith('jamd-offhost-unfunded-'))rmSync(root,{recursive:true,force:true});
 }
}
