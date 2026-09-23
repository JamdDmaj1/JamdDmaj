// Explicit opt-in, disposable wallets only. Not a production tool or APK asset.
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createTestWalletLifecycle} from '../lib/experimental-wallet-lifecycle.js';
import {devnetRpc,DEVNET_GENESIS} from '../lib/experimental-devnet-transfer.js';
import {serializeTestBackup,parseTestBackup} from '../lib/experimental-wallet-vault.js';
if(process.env.JAMDDMAJ_RUN_DEVNET_TEST!=='1')throw new Error('Explicit devnet test opt-in required');
if(await devnetRpc('getGenesisHash')!==DEVNET_GENESIS)throw new Error('Wrong network');
const source=createTestWalletLifecycle(),recovered=createTestWalletLifecycle(),destination=createTestWalletLifecycle();
let password=randomBytes(32).toString('hex');
try{
 const backup=parseTestBackup(serializeTestBackup(await source.create(password)));
 await source.confirmRecovery(backup,password);await source.unlock(password);const original=source.testAddress().address;source.dispose();
 await recovered.restore(backup,password);await recovered.unlock(password);
 if(recovered.testAddress().address!==original)throw new Error('Recovery changed address');
 const destBackup=await destination.create(password);await destination.confirmRecovery(destBackup,password);await destination.unlock(password);
 const recipient=destination.testAddress().address;
 console.log('Encrypted backup restored into a fresh instance. Verified Solana devnet; no real funds.');
 const faucet=await devnetRpc('requestAirdrop',[original,1000000000,{commitment:'confirmed'}]);
 let funded=false;
 for(let i=0;i<12;i++){const result=await devnetRpc('getSignatureStatuses',[[faucet]]);if(['confirmed','finalized'].includes(result?.value?.[0]?.confirmationStatus)&&result.value[0].err===null){funded=true;break}await delay(2000)}
 if(!funded)throw new Error('Devnet faucet confirmation pending; no transfer sent');
 const before=(await devnetRpc('getBalance',[recipient,{commitment:'confirmed'}])).value;
 const session=recovered.transferSession();const review=await session.prepare({recipient,amountSOL:'0.001'});
 await session.confirm({reviewId:review.id,confirmed:true});
 for(let i=0;i<12;i++){const state=await session.checkStatus();if(state.phase==='failed')throw new Error('Devnet transaction failed');if(state.phase==='confirmed')break;await delay(2000)}
 if(session.state.phase!=='confirmed')throw new Error('Devnet transfer pending; do not retry');
 const after=(await devnetRpc('getBalance',[recipient,{commitment:'confirmed'}])).value;
 if(after-before!==1000000)throw new Error('Receiver balance mismatch');
 recovered.lock();destination.lock();console.log(JSON.stringify({network:'solana:devnet',backupRecovery:true,transferConfirmed:true,receivedLamports:after-before,signature:session.state.signature}));
}finally{source.dispose();recovered.dispose();destination.dispose();password='';}
