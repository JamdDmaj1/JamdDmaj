// Identity only: this must not pretend to configure distribution vaults or a pool.
export const JAMD_TOKEN_PRESET=Object.freeze({projectName:'JamdDmaj',symbol:'JAMD',totalSupply:100000000,decimals:6});
export function applyJamdTokenPreset(draft={}) {return {...draft,...JAMD_TOKEN_PRESET};}
