// Explicit local operator command. Never executed by service startup.
import {openBotSwapJournal} from '../lib/perps-bot-swap-journal.js';
let journal;
try{
 if(process.argv.length!==4||process.argv[2]!=='--approve-new-journal')throw Error();
 journal=openBotSwapJournal(process.argv[3],{initialize:true,explicitOperatorApproval:true});
 console.log(JSON.stringify({stage:'BOT_SWAP_JOURNAL_READY',signing:false,tradingEnabled:false}));
}catch{console.error('BOT_SWAP_JOURNAL_INITIALIZATION_UNAVAILABLE');process.exitCode=1;}finally{journal?.close();}
