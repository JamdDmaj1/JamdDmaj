import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
test('every session entry point marshals its origin check and completion to Android UI thread',async()=>{
 const source=await readFile(new URL('android/app/src/main/java/com/jamddmaj/ai/AccountSessionPlugin.java',root),'utf8');
 for(const method of ['save','restore','clear'])assert.match(source,new RegExp('@PluginMethod public void '+method+'\\(PluginCall call\\) \\{ onUiThread\\(call, \\(\\) -> '+method+'OnUiThread\\(call\\)\\); \\}'));
 assert.match(source,/activity\.runOnUiThread/);assert.match(source,/Looper\.myLooper\(\) != Looper\.getMainLooper\(\)/);
 // The fix must retain the existing encrypted data format and trusted origin.
 assert.match(source,/jamddmaj\.account\.session\.v1/);assert.match(source,/jamddmaj_account_session/);
 assert.match(source,/AES\/GCM\/NoPadding/);assert.match(source,/"localhost"\.equals\(page\.getHost\(\)\)/);
});
test('permanent Android publication waits for an actual launcher regression check',async()=>{
 const source=await readFile(new URL('.github/workflows/android-release.yml',root),'utf8');
 assert.match(source,/launcher-verification:/);assert.match(source,/needs: \[wallet-native-verification, wallet-sdk-verification, launcher-verification\]/);
});
