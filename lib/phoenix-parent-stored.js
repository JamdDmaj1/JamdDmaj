// Read-only restart validation, never a new signing authorization.
import {createHash,createPublicKey,verify} from 'node:crypto';
import bs58 from 'bs58';
import {getCompiledTransactionMessageDecoder} from '@solana/kit';
import {buildRegisterTraderIx,getOnboardTraderDelegatedEncoder} from '@ellipsis-labs/rise';
const ONBOARDER='EzkM8YbCkBLaCqX2cdxtMyxfTLpKui3mWQWnhe5w2P4Z',PROGRAM='EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih';
const fail=()=>{throw Error('PHOENIX_PARENT_STORED_REJECTED');};
function key(value,length=32){try{const b=bs58.decode(value);if(b.length!==length||bs58.encode(b)!==value)fail();return b;}catch{fail();}}
function encoded(value,max=1232){if(typeof value!=='string'||value.length>Math.ceil(max/3)*4)fail();const b=Buffer.from(value,'base64');if(b.length>max||b.toString('base64')!==value)fail();return b;}
export function verifyPhoenixStoredParentAttempt(row){
 if(!row||!['PREPARED','SIGNED','UNKNOWN','CANCELLED'].includes(row.state)||row.phase!=='PARENT'||
    !['id','owner','message_hash'].every(k=>typeof row[k]==='string'&&/^[a-f0-9]{64}$/.test(row[k]))||
    typeof row.revision!=='string'||!/^[A-Za-z0-9:_-]{1,128}$/.test(row.revision)||
    !['created','updated','expires'].every(k=>Number.isSafeInteger(row[k]))||row.created<0||row.updated<row.created||row.expires<=row.created||row.expires-row.created>900000||
    typeof row.maximum_lamports!=='string'||!/^[1-9]\d{0,8}$/.test(row.maximum_lamports)||BigInt(row.maximum_lamports)>100000000n||
    typeof row.last_height!=='string'||!/^[1-9]\d{0,15}$/.test(row.last_height)||!Number.isSafeInteger(Number(row.last_height)))fail();
 key(row.wallet);key(row.parent);const p=JSON.parse(row.preparation),s=JSON.parse(row.simulation),message=encoded(row.message,1103);
 const decoded=getCompiledTransactionMessageDecoder().decode(message),hash=createHash('sha256').update(message).digest('hex');
 const keys=decoded.staticAccounts,ins=decoded.instructions,global='2zskx2iyCvb6Stg7RBZkt1f6MrF4dpYtMG3yMvKwqtUZ',log='GdxfTLSsdSY37G6fZoYtdGDSfgFnbT2EmRpuePZxWShS';
 const expected=buildRegisterTraderIx({programAddress:PROGRAM,logAuthorityAddress:log,globalConfigurationAddress:global,payer:row.wallet,trader:row.wallet,traderAccount:row.parent,maxPositions:32n,traderPdaIndex:0,traderSubaccountIndex:0});
 if(ins.length!==2||ins[0].accountIndices.length!==7||ins[1].accountIndices.length<8||ins[1].accountIndices.length>38||
    expected.accounts.some((a,i)=>keys[ins[0].accountIndices[i]]!==a.address)||!Buffer.from(ins[0].data).equals(Buffer.from(expected.data))||
    !Buffer.from(ins[1].data).equals(Buffer.from(getOnboardTraderDelegatedEncoder().encode(undefined)))||
    [PROGRAM,log,global,ONBOARDER,'6UCimUpRW2CGh3ESJm3S59c4WcCaVLYcpPPbbrfX2nzr',row.parent].some((a,i)=>keys[ins[1].accountIndices[i]]!==a))fail();
 if(hash!==row.message_hash||decoded.version!=='legacy'||decoded.header.numSignerAccounts!==2||decoded.staticAccounts[0]!==row.wallet||decoded.staticAccounts[1]!==ONBOARDER||
    decoded.instructions.length!==2||decoded.instructions.some(ix=>decoded.staticAccounts[ix.programAddressIndex]!==PROGRAM)||
    p.stage!=='PHOENIX_PARENT_UNSIGNED'||p.walletAddress!==row.wallet||p.parentAddress!==row.parent||p.onboarder!==ONBOARDER||
    p.messageBase64!==row.message||p.messageHash!==row.message_hash||p.lastValidBlockHeight!==Number(row.last_height)||p.maxPositions!==32||
    s.stage!=='PHOENIX_PARENT_SIMULATED'||s.walletAddress!==row.wallet||s.parentAddress!==row.parent||s.messageHash!==hash||
    s.networkFeeLamports!=='10000'||!/^\d{1,9}$/.test(s.rentLockedLamports)||
    BigInt(s.maximumLamports)!==10000n+BigInt(s.rentLockedLamports)||BigInt(s.maximumLamports)>BigInt(row.maximum_lamports))fail();
 const unsigned=encoded(p.serializedTxBase64);
 if(unsigned[0]!==2||unsigned.length!==message.length+129||unsigned.subarray(1,129).some(n=>n!==0)||!unsigned.subarray(129).equals(message))fail();
 if(['PREPARED','CANCELLED'].includes(row.state)){if(row.signed!==null||row.signature!==null)fail();}
 else{const wire=encoded(row.signed),signature=key(row.signature,64),publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(key(row.wallet))]),format:'der',type:'spki'});
  if(wire.length!==unsigned.length||wire[0]!==2||!wire.subarray(65).equals(unsigned.subarray(65))||!wire.subarray(1,65).equals(signature)||!verify(null,message,publicKey,signature))fail();}
 return row;
}
