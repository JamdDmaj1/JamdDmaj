import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('device verification has an explicit separate network-disabled build, never a production target',()=>{
  const gradle=read('android/app/build.gradle');
  assert.match(gradle,/walletAudit\s*\{[\s\S]*?applicationIdSuffix "\.walletaudit"/);
  assert.match(gradle,/deviceTestVariant in \['debug', 'walletAudit'\]/);
  const manifest=read('android/app/src/walletAudit/AndroidManifest.xml');
  for(const permission of ['INTERNET','RECORD_AUDIO','POST_NOTIFICATIONS'])assert.match(manifest,new RegExp('android.permission.'+permission+'" tools:node="remove"'));
  assert.match(manifest,/android:allowBackup="false"/);assert.match(manifest,/android:usesCleartextTraffic="false"/);
});
test('device tests refuse other package identities and use only disposable offline fixture records',()=>{
  const source=read('android/app/src/androidTest/java/com/jamddmaj/ai/wallet/NativeWalletDeviceAcceptanceTest.java');
  assert.match(source,/PACKAGE="com\.jamddmaj\.ai\.walletaudit"/);
  assert.match(source,/@Before[\s\S]*?assertEquals\("Refusing to test any existing wallet package",PACKAGE,context.getPackageName\(\)\)/);
  assert.match(source,/PERMISSION_DENIED,context.checkSelfPermission\(Manifest.permission.INTERNET\)/);
  assert.match(source,/Files.createTempDirectory\(context.getNoBackupFilesDir\(\).toPath\(\),"offline-journal-"\)/);
  for(const forbidden of ['new NativeWalletRpc','prepareOpen(','completeOpen(','clearApplicationUserData','executeShellCommand','sendTransaction','setRotation('])assert.equal(source.includes(forbidden),false,forbidden);
  assert.match(source,/not a Solana transaction/);
});
