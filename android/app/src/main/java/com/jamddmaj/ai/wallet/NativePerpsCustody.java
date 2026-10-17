package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Arrays;

/** Reads only the custody identity/pricing prefix, not a signing authorization.
 * Addresses: developers.jup.ag/docs/perps/custody-account, cross-checked against
 * mainnet program-owned accounts and the current on-chain Anchor IDL. */
final class NativePerpsCustody {
    static final String PROGRAM="PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu";
    static final String POOL="5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq";
    final String asset,address,mint,tokenAccount,oracle;
    final int decimals;
    final boolean stable,allowIncrease,allowDecrease;
    final BigInteger maxLeverageBps;
    private NativePerpsCustody(String asset,String address,String mint,byte[] data){
        this.asset=asset;this.address=address;this.mint=mint;
        tokenAccount=DevnetSolana.encode(Arrays.copyOfRange(data,72,104));
        oracle=DevnetSolana.encode(Arrays.copyOfRange(data,106,138));
        decimals=data[104]&255;stable=data[105]==1;
        allowIncrease=data[202]==1;allowDecrease=data[203]==1;
        byte[] big=new byte[8];for(int i=0;i<8;i++)big[i]=data[182-i];
        maxLeverageBps=new BigInteger(1,big);
    }
    static String address(String asset){return identity(asset)[0];}
    void checkIncreaseAccounts(byte[][] keys,NativePerpsCustody collateral){
        if(keys==null||keys.length!=20||collateral==null||!allowIncrease||!collateral.allowIncrease)throw invalid();
        for(byte[] key:keys)if(key==null||key.length!=32)throw invalid();
        matches(keys[5],POOL);
        matches(keys[7],address);matches(keys[9],oracle);
        matches(keys[10],collateral.address);matches(keys[12],collateral.oracle);
        matches(keys[13],collateral.tokenAccount);
        matches(keys[19],PROGRAM);
    }
    private static void matches(byte[] key,String address){if(!Arrays.equals(key,DevnetSolana.decode(address,32)))throw invalid();}
    private static String[] identity(String asset){
        if("SOL".equals(asset))return new String[]{"7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz","So11111111111111111111111111111111111111112","9","0"};
        if("ETH".equals(asset))return new String[]{"AQCGyheWPLeo6Qp9WpYS9m3Qj479t7R636N9ey1rEjEn","7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs","8","0"};
        if("BTC".equals(asset))return new String[]{"5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm","3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh","8","0"};
        if("USDC".equals(asset))return new String[]{"G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa","EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","6","1"};
        throw invalid();
    }
    static NativePerpsCustody decode(String asset,String account,String owner,boolean executable,byte[] input){
        String[] expected=identity(asset);
        if(!expected[0].equals(account)||!PROGRAM.equals(owner)||executable||input==null||input.length<206||input.length>8192)throw invalid();
        byte[] data=input.clone();
        byte[] discriminator={1,(byte)184,48,81,93,(byte)131,63,(byte)145};
        if(!Arrays.equals(discriminator,Arrays.copyOf(data,8))
                ||!Arrays.equals(DevnetSolana.decode(POOL,32),Arrays.copyOfRange(data,8,40))
                ||!Arrays.equals(DevnetSolana.decode(expected[1],32),Arrays.copyOfRange(data,40,72))
                ||(data[104]&255)!=Integer.parseInt(expected[2])||(data[105]&255)!=Integer.parseInt(expected[3])
                ||data[138]!=2)throw invalid(); // Only current Pyth layout supported.
        for(int i=199;i<206;i++)if(data[i]!=0&&data[i]!=1)throw invalid();
        NativePerpsCustody result=new NativePerpsCustody(asset,account,expected[1],data);
        if(result.maxLeverageBps.signum()<=0)throw invalid();
        return result;
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Unverified perps custody identity or layout");}
}
