import {setupHyperliquidValidationUI} from './lib/hyperliquid-validation-ui.js';
const ui=setupHyperliquidValidationUI(document);
addEventListener('pagehide',()=>ui.dispose(),{once:true});
