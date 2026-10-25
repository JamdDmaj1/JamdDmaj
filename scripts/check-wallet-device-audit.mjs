import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';

// Packaging verification only. Never installs, starts, signs a wallet request,
// accesses a phone, changes a setting or contacts any financial service.
const root=resolve(import.meta.dirname,'..');
function manifests(path){return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?manifests(join(path,e.name)):e.name==='AndroidManifest.xml'?[join(path,e.name)]:[]);}
const found=manifests(resolve(root,'android/app/build/intermediates/merged_manifests/walletAudit'));
if(found.length!==1)throw Error('Expected one audit manifest');
const xml=readFileSync(found[0],'utf8');
for(const required of ['package="com.jamddmaj.ai.walletaudit"','android:allowBackup="false"','android:usesCleartextTraffic="false"','JamdDmaj Offline Checks']){
  if(!xml.includes(required))throw Error('Audit boundary missing: '+required);
}
for(const forbidden of ['android.permission.INTERNET','android.permission.RECORD_AUDIO','android.permission.POST_NOTIFICATIONS','android.intent.action.VIEW','android.intent.category.BROWSABLE']){
  if(xml.includes(forbidden))throw Error('Unexpected audit capability: '+forbidden);
}
const native=xml.match(/<activity\b[^>]*android:name="com\.jamddmaj\.ai\.wallet\.NativeWalletActivity"[^>]*>/)?.[0];
if(!native?.includes('android:exported="false"')||!native.includes('android:process=":native_wallet"'))throw Error('Private wallet process boundary missing');
const [apk,aapt]=process.argv.slice(2);
if(Boolean(apk)!==Boolean(aapt))throw Error('Supply both APK and aapt paths, or neither');
if(apk){
  const absolute=resolve(apk);
  if(!absolute.startsWith(root+'\\')&&!absolute.startsWith(root+'/'))throw Error('Audit APK must stay inside this project');
  const badging=execFileSync(aapt,['dump','badging',absolute],{encoding:'utf8'});
  if(!badging.includes("package: name='com.jamddmaj.ai.walletaudit'")||!badging.includes('-walletaudit'))throw Error('Wrong packaged app identity');
  const permissions=execFileSync(aapt,['dump','permissions',absolute],{encoding:'utf8'});
  for(const permission of ['android.permission.INTERNET','android.permission.RECORD_AUDIO','android.permission.POST_NOTIFICATIONS'])if(permissions.includes(permission))throw Error('Packaged permission leaked: '+permission);
  const tree=execFileSync(aapt,['dump','xmltree',absolute,'AndroidManifest.xml'],{encoding:'utf8'});
  for(const action of ['android.intent.action.VIEW','android.intent.category.BROWSABLE'])if(tree.includes(action))throw Error('Packaged external callback leaked: '+action);
  console.log('Final APK identity, audit version and absent network/audio/notification permissions verified.');
}
console.log('Audit manifest verified: distinct app ID; no networking or OAuth callbacks; no backup; private native-wallet process. No device operation performed.');
