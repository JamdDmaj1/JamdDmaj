import com.jamddmaj.ai.wallet.WalletNetwork;
import java.math.BigInteger;
import java.util.HashSet;

public final class WalletNetworkCheck {
    private interface Check {void run();}
    private static void rejects(Check check){try{check.run();throw new AssertionError("Invalid input accepted");}catch(IllegalArgumentException expected){}}
    public static void main(String[] args){
        HashSet<String> domains=new HashSet<>();
        for(WalletNetwork n:WalletNetwork.values()){
            if(!domains.add(n.storageDomain)||WalletNetwork.fromStorageDomain(n.storageDomain)!=n)throw new AssertionError("Domain collision");
            for(String bad:new String[]{"0","-1","1e-3"," 1","1 ","01","NaN","1,5",".1","1."})rejects(()->n.parseNativeAmount(bad));
            rejects(()->n.verifyIdentity(null));rejects(()->n.verifyIdentity(56));
        }
        WalletNetwork.SOLANA_MAINNET.verifyIdentity("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d");
        WalletNetwork.BNB_MAINNET.verifyIdentity("0x38");
        rejects(()->WalletNetwork.BNB_MAINNET.verifyIdentity("0x61"));
        rejects(()->WalletNetwork.BNB_TESTNET.verifyIdentity("0x38"));
        rejects(()->WalletNetwork.SOLANA_MAINNET.verifyIdentity("EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"));
        rejects(()->WalletNetwork.fromStorageDomain("mainnet"));
        if(!WalletNetwork.BNB_MAINNET.parseNativeAmount("0.000000000000000001").equals(BigInteger.ONE))throw new AssertionError("Lost wei");
        if(!WalletNetwork.SOLANA_MAINNET.parseNativeAmount("0.000000001").equals(BigInteger.ONE))throw new AssertionError("Lost lamport");
        rejects(()->WalletNetwork.SOLANA_MAINNET.parseNativeAmount("0.0000000001"));
        rejects(()->WalletNetwork.BNB_MAINNET.parseNativeAmount("0.0000000000000000001"));
        rejects(()->WalletNetwork.SOLANA_MAINNET.parseNativeAmount("18446744074"));
        System.out.println("Wallet network domains, chain identities and exact native units passed; no funds or RPC calls.");
    }
}
