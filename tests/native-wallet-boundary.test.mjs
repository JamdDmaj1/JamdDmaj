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
