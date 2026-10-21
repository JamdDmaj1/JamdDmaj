// Strict observed DOVES extension, not an IDL claim or standalone provenance.
// Same-bank unsigned native evidence at 459603291 and 459603638 binds 96..104
// to signed microseconds and 104..112 to floor(confidence * 10000 / price).
// Unknown bytes/configuration are never ignored; no signing authority exists.
function fail(reason){throw Error('UNVERIFIED_PERPS_CLOSE_ORACLE_EFFECTS_'+reason);}
function nativeState(b){
 if(!Buffer.isBuffer(b)||![96,283].includes(b.length))fail('CONFIGURATION');
 const timestamp=b.readBigInt64LE(82);if(timestamp<0n)fail('TIMESTAMP_EXTENSION');
 if(b.length===96)return {timestamp,micros:null,confidence:null};
 const micros=b.readBigUInt64LE(96),confidence=b.readBigUInt64LE(104);
 // The old IDL-sized state can occupy an allocation with zero extension fields. It does
 // not acquire a fabricated microsecond/confidence observation.
 if(micros===0n&&confidence===0n)return {timestamp,micros:null,confidence:null};
 if(micros===0n||micros/1000000n!==timestamp||confidence>10000n)fail('TIMESTAMP_EXTENSION');
 return {timestamp,micros,confidence};
}
export function comparePerpsDovesLazerConfiguration(a,b){
 if(a.length!==b.length)fail('CONFIGURATION');
 if(!a.subarray(0,73).equals(b.subarray(0,73))||!a.subarray(90,96).equals(b.subarray(90,96))||!a.subarray(112).equals(b.subarray(112)))fail('CONFIGURATION');
 // Parsing checks every remaining byte: only the two explicitly validated
 // extension u64 fields may move. The unknown suffix must remain byte-identical;
 // it is not presumed to be zero, padding, a price or harmless writable data.
 return {before:nativeState(a),after:nativeState(b)};
}
export function checkPerpsDovesLazerEffects(a,b,signed){
 // Check signed base fields before internal timestamp consistency, preserving
 // the distinction between bad signed effects and unrelated configuration.
 const changed=!a.subarray(73,90).equals(b.subarray(73,90))||!a.subarray(96,112).equals(b.subarray(96,112));
 if(changed&&!signed)fail('UNSIGNED_FEED_EFFECTS');
 if(changed&&(b.readBigUInt64LE(73).toString()!==signed.priceUnits||b.readInt8(81)!==signed.exponent
  ||b.readBigInt64LE(82)!==BigInt(signed.timestampUs)/1000000n
  ||signed.feedUpdateTimestampUs!==null&&b.readBigInt64LE(82)!==BigInt(signed.feedUpdateTimestampUs)/1000000n))fail('SIGNED_FEED_EFFECTS');
 const state=comparePerpsDovesLazerConfiguration(a,b);
 if(state.after.timestamp<state.before.timestamp||state.before.micros!==null&&(state.after.micros===null||state.after.micros<state.before.micros))fail('TIMESTAMP_REGRESSION');
 if(changed&&state.after.micros!==null){
  if(state.after.micros!==BigInt(signed.timestampUs)||signed.feedUpdateTimestampUs!==null&&state.after.micros!==BigInt(signed.feedUpdateTimestampUs)
   ||signed.confidenceUnits===null||state.after.confidence!==BigInt(signed.confidenceUnits)*10000n/BigInt(signed.priceUnits))fail('SIGNED_FEED_EXTENSION_EFFECTS');
 }
 return state;
}
