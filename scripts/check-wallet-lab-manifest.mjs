import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const root='android/app/build/intermediates/merged_manifests/debug';
function manifests(path){return readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?manifests(join(path,entry.name)):entry.name==='AndroidManifest.xml'?[join(path,entry.name)]:[])}
const files=manifests(root);
if(files.length!==1)throw new Error('Expected one merged diagnostic manifest');
const xml=readFileSync(files[0],'utf8');
for(const text of ['package="com.jamddmaj.ai.walletlab.devnet"','android:allowBackup="false"','android:usesCleartextTraffic="false"','com.jamddmaj.ai.wallet.DevnetWalletActivity'])if(!xml.includes(text))throw new Error('Missing isolation boundary: '+text);
for(const text of ['android.permission.RECORD_AUDIO','android.permission.POST_NOTIFICATIONS','com.jamddmaj.ai.MainActivity','android.intent.action.VIEW','androidx.core.content.FileProvider'])if(xml.includes(text))throw new Error('Production capability leaked into diagnostic: '+text);
console.log('Devnet lab isolation verified: separate app ID, no backup/production activity, no external callback or file provider, cleartext disabled.');
