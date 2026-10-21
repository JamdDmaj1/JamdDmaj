// Pyth's fixed native Storage account, independently fetched on mainnet. This
// only authenticates signer membership/expiry, not payload prices or authority
// to trade. Layout confirmed against Pyth's published Storage definition and
// program-owned 381-byte account (2026-10-20, slot 459442196).
import bs58 from 'bs58';
export const PERPS_PYTH_LAZER=Object.freeze({program:'pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt',storage:'3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL',treasury:'Gx4MBPb1vqZLJajZmsKLg8fGw9ErhoKsR8LeKcCKFyak'});
const proofs=new WeakMap();
function fail(){throw Error('UNVERIFIED_PERPS_PYTH_STORAGE');}
function bytes(account){
 if(!account||account.owner!==PERPS_PYTH_LAZER.program||account.executable!==false||!Array.isArray(account.data)||account.data[1]!=='base64'||typeof account.data[0]!=='string'||account.data[0].length!==508)fail();
 const b=Buffer.from(account.data[0],'base64');if(b.length!==381||b.toString('base64')!==account.data[0]||b.subarray(0,8).toString('hex')!=='d175ffb9c4af4409')fail();return b;
}
export function decodePerpsPythStorage(address,account){
 if(address!==PERPS_PYTH_LAZER.storage)fail();const b=bytes(account);
 if(bs58.encode(b.subarray(40,72))!==PERPS_PYTH_LAZER.treasury||b[80]>2||b[281]>2)fail();
 const signers=[];
 for(let i=0;i<b[80];i++){
  const at=81+40*i,key=b.subarray(at,at+32),expires=b.readBigInt64LE(at+32),publicKeyHex=key.toString('hex');
  if(!key.some(n=>n!==0)||expires<0n||signers.some(s=>s.publicKeyHex===publicKeyHex))fail();
  signers.push(Object.freeze({publicKeyHex,expiresAtSeconds:expires.toString()}));
 }
 const result=Object.freeze({stage:'PYTH_STORAGE_SIGNER_CONFIGURATION_ONLY',readyForSigning:false,address,treasury:PERPS_PYTH_LAZER.treasury,
  updateFeeLamports:b.readBigUInt64LE(72).toString(),signers:Object.freeze(signers)});
 proofs.set(result,b);return result;
}
export function requirePerpsPythTrustedSigner(storage,publicKeyHex,nowSeconds){
 if(!proofs.has(storage)||typeof publicKeyHex!=='string'||!/^[0-9a-f]{64}$/.test(publicKeyHex)||!Number.isSafeInteger(nowSeconds)||nowSeconds<0)fail();
 const signer=storage.signers.find(s=>s.publicKeyHex===publicKeyHex&&BigInt(s.expiresAtSeconds)>BigInt(nowSeconds));if(!signer)fail();return signer;
}
export function requireUnchangedPerpsPythStorage(storage,before,after){
 const original=proofs.get(storage);if(!original)fail();
 if(!before||!after||before.lamports!==after.lamports||!bytes(before).equals(original)||!bytes(after).equals(original))fail();
 return decodePerpsPythStorage(PERPS_PYTH_LAZER.storage,before);
}
