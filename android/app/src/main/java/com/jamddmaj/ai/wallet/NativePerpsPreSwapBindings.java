package com.jamddmaj.ai.wallet;

import java.util.Arrays;

/** Binds the pre-swap to the same wallet, pool, custody vaults and opening.
 * The custody objects must originate in verified program-owned RPC accounts.
 * Ledger ownership/state, ordering, amounts and effects are separate gates.
 * This class does not authorize signing or accept arbitrary Jupiter routes. */
final class NativePerpsPreSwapBindings {
    private NativePerpsPreSwapBindings() {}
    static void check(byte[][] swap,byte[][] ledger,byte[][] opening,NativePerpsCustody input,NativePerpsCustody output){
        shape(swap,16);shape(ledger,3);shape(opening,20);
        if(input==null||output==null||input.address.equals(output.address)||!input.allowSwap||!output.allowSwap)throw invalid();
        byte[] owner=opening[2];
        same(swap[0],owner);
        same(swap[1],NativePerpsTokenBoundary.associated(owner,input.mint));
        same(swap[2],NativePerpsTokenBoundary.associated(owner,output.mint));
        same(swap[3],NativePerpsAddresses.transferAuthority());
        same(swap[4],NativePerpsAddresses.perpetuals());
        address(swap[5],NativePerpsCustody.POOL);
        address(swap[6],input.address);address(swap[7],input.dovesAgOracle);address(swap[8],input.tokenAccount);
        address(swap[9],output.address);address(swap[10],output.dovesAgOracle);address(swap[11],output.tokenAccount);
        address(swap[12],SplTokenAccount.PROGRAM);
        address(swap[13],"Sysvar1nstructions1111111111111111111111111");
        same(swap[14],NativePerpsAddresses.eventAuthority());address(swap[15],NativePerpsCustody.PROGRAM);
        same(opening[3],swap[2]);same(opening[4],swap[4]);same(opening[5],swap[5]);
        same(opening[10],swap[9]);same(opening[11],swap[10]);same(opening[13],swap[11]);
        same(opening[16],swap[12]);same(opening[18],swap[14]);same(opening[19],swap[15]);
        same(ledger[0],opening[14]);same(ledger[1],swap[2]);same(ledger[2],swap[12]);
        // A ledger is a separate program-owned account, never a wallet, token
        // account, vault or program accidentally reinterpreted as scratch state.
        for(byte[] role:swap)if(Arrays.equals(ledger[0],role))throw invalid();
        if(Arrays.equals(ledger[0],opening[6]))throw invalid();
    }
    private static void shape(byte[][] accounts,int count){
        if(accounts==null||accounts.length!=count)throw invalid();
        for(byte[] key:accounts)if(key==null||key.length!=32)throw invalid();
    }
    private static void address(byte[] key,String expected){same(key,DevnetSolana.decode(expected,32));}
    private static void same(byte[] actual,byte[] expected){if(!Arrays.equals(actual,expected))throw invalid();}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Perps pre-swap accounts differ from custody and opening");}
}
