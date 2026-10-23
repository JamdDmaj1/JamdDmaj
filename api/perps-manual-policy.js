import {createManualPerpsRelay} from '../lib/perps-manual-relay.js';
import {enforceQuoteLimit} from './swap-quote.js';
export const createHandler=options=>createManualPerpsRelay({path:'/api/perps-manual-policy',limit:enforceQuoteLimit,...options});
export default {fetch:createHandler()};
