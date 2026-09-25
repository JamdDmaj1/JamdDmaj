package com.jamddmaj.ai.wallet;

import java.math.BigInteger;

/** Explicit chain domains for the production wallet. No fallback between real/test networks. */
public enum WalletNetwork {
    SOLANA_MAINNET("solana-mainnet", "SOL", 9, true, "getGenesisHash", "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"),
    SOLANA_DEVNET("solana-devnet", "SOL", 9, false, "getGenesisHash", "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"),
    BNB_MAINNET("bsc-mainnet", "BNB", 18, true, "eth_chainId", "0x38"),
    BNB_TESTNET("bsc-testnet", "tBNB", 18, false, "eth_chainId", "0x61");

    public final String storageDomain,symbol,identityMethod;
    public final int decimals;
    public final boolean realFunds;
    private final String identity;
    WalletNetwork(String domain,String coin,int precision,boolean real,String method,String expected){storageDomain=domain;symbol=coin;decimals=precision;realFunds=real;identityMethod=method;identity=expected;}
    public void verifyIdentity(Object result){
        if(!(result instanceof String)||!identity.equals(result))throw new IllegalArgumentException("Network identity mismatch");
    }
    public static WalletNetwork fromStorageDomain(String domain){
        for(WalletNetwork network:values())if(network.storageDomain.equals(domain))return network;
        throw new IllegalArgumentException("Unsupported network; no default");
    }
    public BigInteger parseNativeAmount(String input){
        if(input==null||input.length()>100||!input.matches("(0|[1-9][0-9]*)(\\.[0-9]{1,"+decimals+"})?"))throw new IllegalArgumentException("Invalid native amount");
        String[] parts=input.split("\\.",-1);String fraction=parts.length==2?parts[1]:"";
        StringBuilder padded=new StringBuilder(fraction);while(padded.length()<decimals)padded.append('0');
        BigInteger value=new BigInteger(parts[0]).multiply(BigInteger.TEN.pow(decimals)).add(new BigInteger(padded.toString()));
        int bits=identityMethod.equals("getGenesisHash")?64:256;
        if(value.signum()<=0||value.bitLength()>bits)throw new IllegalArgumentException("Native amount outside chain range");return value;
    }
}
