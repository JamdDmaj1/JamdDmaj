// Fixed UI text only; never renders provider messages as HTML.
export function webWalletPendingText(pending){
 if(!pending)return 'No hay operaciones web pendientes registradas en este navegador.';
 const labels={FINALIZED:'Confirmada definitivamente en Solana.',FAILED:'Solana confirmó que la operación falló.',CONFIRMING:'Recibida por Solana, esperando confirmación definitiva. No la repitas.',UNKNOWN:'Resultado aún desconocido. No repitas el intercambio; vuelve a consultar.'};
 return (labels[pending.state]||labels.UNKNOWN)+' ID: '+String(pending.signature||'');
}
export function webWalletReviewSeconds(expiresAt,now=Date.now()){
 if(!Number.isSafeInteger(expiresAt)||!Number.isFinite(now))return 0;
 return Math.max(0,Math.ceil((expiresAt-now)/1000));
}
