// Canonical owner-selected review limits, not proof of execution or authority.
export function validatePerpsCloseReturnLimits(value){
 const fail=()=>{throw Error('PERPS_CLOSE_RETURN_POLICY_MISMATCH');};
 if(!value||Object.keys(value).sort().join(',')!=='maximumNetworkFeeLamports,minimumReturnUnits')fail();
 for(const key of ['minimumReturnUnits','maximumNetworkFeeLamports'])if(typeof value[key]!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(value[key])||BigInt(value[key])>18446744073709551615n)fail();
 if(BigInt(value.maximumNetworkFeeLamports)<1n||BigInt(value.maximumNetworkFeeLamports)>1000000n)fail();
 return Object.freeze({minimumReturnUnits:value.minimumReturnUnits,maximumNetworkFeeLamports:value.maximumNetworkFeeLamports});
}
