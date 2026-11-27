// Fixed UI text only; never renders provider messages as HTML.
export function webWalletPendingText(pending){
 if(!pending)return 'There are no web operations pending in this browser.';
 const labels={FINALIZED:'Finalized on Solana.',FAILED:'Solana confirmed the operation failed.',CONFIRMING:'Received by Solana, awaiting final confirmation. Do not repeat it.',UNKNOWN:'Result still unknown. Do not repeat the swap; check again.'};
 return (labels[pending.state]||labels.UNKNOWN)+' ID: '+String(pending.signature||'');
}
export function webWalletReviewSeconds(expiresAt,now=Date.now()){
 if(!Number.isSafeInteger(expiresAt)||!Number.isFinite(now))return 0;
 return Math.max(0,Math.ceil((expiresAt-now)/1000));
}
