// Shared browser/native-WebView confirmation view. It cannot connect a wallet,
// invent an invoice, sign or send automatically. The authenticated adapter is
// responsible for binding a server-issued review to its payment claim.
import {PERPS_PLATFORM_FEE,quotePerpsPlatformFee} from './perps-platform-fee.js';
function amount(value,decimals){
 const s=value.padStart(decimals+1,'0'),fraction=s.slice(-decimals).replace(/0+$/,'');
 return s.slice(0,-decimals)+(fraction?'.'+fraction:'');
}
export function setupPerpsPlatformFeeReviewPanel({parent,doc,language='es',readWallet,submit,now=Date.now}={}){
 if(!parent||!doc||typeof readWallet!=='function'||typeof submit!=='function'||typeof now!=='function')throw Error('FEE_REVIEW_PANEL_UNAVAILABLE');
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const el=doc.createElement(tag);if(text)el.textContent=text;return el;};
 const section=node('section');section.className='card platform-fee-review';section.hidden=true;
 const title=node('h3',t('Revisar comisión de JamdDmaj','Review JamdDmaj fee')),commercial=node('p'),network=node('p'),destination=node('p'),status=node('p');status.setAttribute('role','status');
 const consent=node('input');consent.type='checkbox';consent.checked=false;
 const label=node('label');label.append(consent,node('span',t('Acepto este pago separado en USDC y pagar la red con mi SOL.','I accept this separate USDC payment and paying the network fee with my SOL.')));
 const confirm=node('button',t('Revisar y firmar pago separado','Review and sign separate payment'));confirm.type='button';
 section.append(title,commercial,network,destination,label,confirm,status);parent.append(section);
 let current=null,sourceReview=null,busy=false,disposed=false,revision=0,expiry;
 function valid(){return current&&current.walletAddress===readWallet()&&now()<current.expiresAt&&now()>=current.receivedAt
  &&doc.hidden!==true&&doc.visibilityState!=='hidden'&&doc.hasFocus?.()!==false;}
 function render(){confirm.disabled=busy||!valid()||consent.checked!==true;consent.disabled=busy||!valid();}
 function invalidate(){revision++;current=null;sourceReview=null;clearTimeout(expiry);consent.checked=false;commercial.textContent='';network.textContent='';destination.textContent='';section.hidden=true;render();}
 function setReview(review){
  if(disposed||busy)throw Error('FEE_REVIEW_PANEL_UNAVAILABLE');invalidate();
  const quote=quotePerpsPlatformFee(review?.marginUnits),at=now();
  if(!review||review.stage!=='SEPARATE_PLATFORM_FEE_PAYMENT_REVIEW'||review.readyForSigning!==false
   ||review.walletAddress!==readWallet()||review.recipient!==PERPS_PLATFORM_FEE.recipient||review.mint!==PERPS_PLATFORM_FEE.mint
   ||review.termsVersion!==PERPS_PLATFORM_FEE.version||review.feeUnits!==quote.feeUnits
   ||review.networkFeePayer!=='TRADER'||review.networkFeeToken!=='SOL'||review.networkSponsorshipAvailable!==false
   ||typeof review.assessmentId!=='string'||!/^[a-f0-9]{64}$/.test(review.assessmentId)
   ||typeof review.networkFeeLamports!=='string'||!/^[1-9][0-9]{0,4}$/.test(review.networkFeeLamports)||BigInt(review.networkFeeLamports)>10000n
   ||review.rentLamports!=='0'||!Number.isSafeInteger(review.expiresAt)||review.expiresAt<=at||review.expiresAt>at+60000)throw Error('INVALID_FEE_REVIEW');
  current=Object.freeze({...review,receivedAt:at});sourceReview=review;section.hidden=false;status.textContent='';
  expiry=setTimeout(render,Math.max(1,review.expiresAt-at));expiry?.unref?.();
  commercial.textContent=t('Comisión de JamdDmaj: ','JamdDmaj fee: ')+amount(quote.feeUnits,6)+' USDC · 0,20% '+t('del margen de ','of margin ')+amount(quote.marginUnits,6)+' USDC.';
  network.textContent=t('Red, pagada por ti: ','Network fee, paid by you: ')+amount(review.networkFeeLamports,9)+' SOL. '+t('No hay patrocinio. Esta comisión es adicional a los costes de Jupiter.','No sponsorship. This fee is additional to Jupiter costs.');
  destination.textContent=t('Destino del USDC: ','USDC destination: ')+review.recipient;render();
 }
 consent.onchange=render;
 confirm.onclick=async()=>{
  if(busy||disposed||!valid()||consent.checked!==true){render();return;}
  const review=current,original=sourceReview,ticket=revision;busy=true;render();
  try{
   const result=await submit(original,{explicitApproval:true});
   if(disposed||ticket!==revision||review.walletAddress!==readWallet())return;
   if(!result||result.assessmentId!==review.assessmentId||result.paid!==false||result.readyForRetry!==false
    ||!['PLATFORM_FEE_SUBMISSION_ACKNOWLEDGED','PLATFORM_FEE_SUBMISSION_UNKNOWN'].includes(result.stage))throw Error();
   status.textContent=t('Pago pendiente de confirmación. No lo repitas; consulta su estado.','Payment pending confirmation. Do not repeat it; check its status.');
  }catch{if(!disposed&&ticket===revision)status.textContent=t('El pago no se confirmó. Revisa su estado antes de intentar otra operación.','Payment was not confirmed. Check its status before attempting another operation.');}
  finally{current=null;sourceReview=null;clearTimeout(expiry);consent.checked=false;busy=false;render();}
 };
 doc.addEventListener?.('jamd-wallet-portfolio',invalidate);doc.addEventListener?.('jamd-web-wallet-session',invalidate);render();
 return Object.freeze({section,commercial,network,destination,status,consent,confirm,setReview,invalidate,
  dispose(){disposed=true;invalidate();doc.removeEventListener?.('jamd-wallet-portfolio',invalidate);doc.removeEventListener?.('jamd-web-wallet-session',invalidate);}});
}
