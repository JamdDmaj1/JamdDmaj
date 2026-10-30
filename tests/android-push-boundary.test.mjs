import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('Android push client is explicit opt-in, private, origin guarded and never a wallet action',async()=>{
 const [plugin,service,manifest,main,res]=await Promise.all([
  read('android/app/src/main/java/com/jamddmaj/ai/MarketPushPlugin.java'),read('android/app/src/main/java/com/jamddmaj/ai/MarketPushService.java'),read('android/app/src/main/AndroidManifest.xml'),read('android/app/src/main/java/com/jamddmaj/ai/MainActivity.java'),read('android/app/src/release/res/values/firebase-client.xml')]);
 assert.match(manifest,/firebase_messaging_auto_init_enabled" android:value="false/);
 assert.match(manifest,/firebase_analytics_collection_enabled" android:value="false/);
 assert.match(manifest,/MarketPushService" android:exported="false/);
 assert.match(plugin,/runOnUiThread/);assert.match(plugin,/if\(!trusted\(\)\|\|!configured\(\)\)/);
 assert.match(plugin,/requestPermissionForAlias/);assert.match(plugin,/deleteToken\(\)/);
 assert.doesNotMatch(plugin+service,/signTransaction|sendTransaction|NativeWallet|seed|private_key/);
 assert.match(service,/getBoolean\("enabled",false\)/);assert.match(service,/VISIBILITY_PRIVATE/);
 assert.match(main,/registerPlugin\(MarketPushPlugin.class\)/);
 assert.match(res,/jamddmaj-2afc8/);assert.match(res,/1:224373038543:android:4a892cc25987b68b74c6ba/);
});
