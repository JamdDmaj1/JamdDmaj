import test from 'node:test';import assert from 'node:assert/strict';
import {managedChatError} from '../web-trial-ui.js';
test('server and provider failures are not mislabeled as expired login or exhausted allowance',()=>{
 assert.match(managedChatError('trial-provider-unavailable',503,'es'),/CHAT_PROVIDER_UNAVAILABLE/);
 assert.match(managedChatError('trial-unavailable',500,'es'),/CHAT_SERVICE_500/);
 assert.match(managedChatError('trial-upstream',401,'es'),/CHAT_PROVIDER_401/);
 assert.doesNotMatch(managedChatError('trial-upstream',401,'es'),/Vuelve a iniciar/);
 assert.match(managedChatError('trial-login',401,'es'),/sesión/);
 assert.match(managedChatError('credits-exhausted',403,'es'),/cuota gratuita/);
 assert.match(managedChatError('trial-unavailable',429,'es'),/límite temporal/);
});
