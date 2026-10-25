import {getWalletRegistry} from './lib/wallet-standard-registry.js';
import {setupFeeRecipientSetupPage} from './lib/fee-recipient-setup-page.js';
setupFeeRecipientSetupPage({doc:document,registry:getWalletRegistry(),fetchImpl:fetch.bind(globalThis),storage:localStorage,locks:navigator.locks});
