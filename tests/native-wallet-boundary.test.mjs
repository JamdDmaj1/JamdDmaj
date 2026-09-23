import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
test('native experimental vault is debug-only, unregistered and hardware-authenticated',()=>{
 const source=readFileSync(new URL('../android/app/src/debug/java/com/jamddmaj/ai/wallet/HardwareTestVault.java',import.meta.url),'utf8');
 assert.match(source,/getNoBackupFilesDir/);
 assert.match(source,/setUserAuthenticationParameters\(0, KeyProperties.AUTH_BIOMETRIC_STRONG\)/);
 assert.match(source,/isUserAuthenticationRequirementEnforcedBySecureHardware/);
 assert.match(source,/cipher\.updateAAD\(aad\)/);
 assert.doesNotMatch(source,/JavascriptInterface|CapacitorPlugin|Log\.|System\.out|SharedPreferences/);
 const activity=readFileSync(new URL('../android/app/src/main/java/com/jamddmaj/ai/MainActivity.java',import.meta.url),'utf8');
 assert.doesNotMatch(activity,/HardwareTestVault/);
 assert.equal(existsSync(new URL('../android/app/src/main/java/com/jamddmaj/ai/wallet/HardwareTestVault.java',import.meta.url)),false);
});
test('diagnostic UI authenticates exact cipher, locks on stop and is isolated from production',()=>{
 const activity=readFileSync(new URL('../android/app/src/debug/java/com/jamddmaj/ai/wallet/VaultDiagnosticActivity.java',import.meta.url),'utf8');
 assert.match(activity,/FLAG_SECURE/);
 assert.match(activity,/getCipher\(\)!=operation.authenticationCipher\(\)/);
 assert.match(activity,/onStop\(\)\{lock\(\)/);
 assert.match(activity,/onDestroy\(\)\{lock\(\)/);
 assert.doesNotMatch(activity,/WebView|loadUrl|registerPlugin|http[s]?:|Log\./);
 const manifest=readFileSync(new URL('../android/app/src/debug/AndroidManifest.xml',import.meta.url),'utf8');
 assert.match(manifest,/android:allowBackup="false"/);
 assert.match(manifest,/android.permission.INTERNET" tools:node="remove"/);
 const gradle=readFileSync(new URL('../android/app/build.gradle',import.meta.url),'utf8');
 assert.match(gradle,/applicationIdSuffix "\.walletlab"/);
});
