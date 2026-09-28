package com.jamddmaj.ai.wallet;
import java.util.*;
import java.math.BigInteger;
public final class SolanaMessageCompilerCheck {
    static byte[] key(int n) { byte[] b = new byte[32]; b[0]=(byte)n; return b; }
    static void require(boolean b) { if (!b) throw new AssertionError(); }
    static void reject(Runnable r) { try { r.run(); } catch (IllegalArgumentException expected) { return; } throw new AssertionError("accepted"); }
    static SolanaLookupTables.Account table(int n, int... keys) {
        byte[] data = new byte[56+32*keys.length]; data[0]=1; Arrays.fill(data,4,12,(byte)255);
        for(int i=0;i<keys.length;i++) System.arraycopy(key(keys[i]),0,data,56+i*32,32);
        return new SolanaLookupTables.Account(key(n),SolanaLookupTables.PROGRAM,false,data,BigInteger.TEN);
    }
    public static void main(String[] args) {
        List<SolanaMessageCompiler.Meta> metas = Arrays.asList(
            new SolanaMessageCompiler.Meta(key(1),true,true),new SolanaMessageCompiler.Meta(key(3),false,false),
            new SolanaMessageCompiler.Meta(key(4),false,true),new SolanaMessageCompiler.Meta(key(5),false,false),
            new SolanaMessageCompiler.Meta(key(6),false,true));
        List<SolanaMessageCompiler.Instruction> instructions = List.of(new SolanaMessageCompiler.Instruction(key(2),metas,new byte[]{7}));
        SolanaMessage legacy = SolanaMessageCompiler.compile(key(1),key(9),instructions,List.of(),BigInteger.ONE);
        require(legacy.version==-1 && legacy.accountCount==6 && legacy.signatures==1);
        List<SolanaLookupTables.Account> tables = List.of(table(20,3,4),table(21,5,6));
        SolanaMessage v0 = SolanaMessageCompiler.compile(key(1),key(9),instructions,tables,BigInteger.ONE);
        require(v0.version==0 && v0.staticAccountCount()==2);
        require(Arrays.equals(v0.instructions.get(0).accounts(),new byte[]{0,4,2,5,3}));
        require(v0.isWritable(2) && v0.isWritable(3) && !v0.isWritable(4));
        reject(()->SolanaMessageCompiler.compile(key(1),key(9),instructions,tables,BigInteger.valueOf(11)));
        reject(()->SolanaMessageCompiler.compile(key(1),key(9),instructions,List.of(tables.get(0),tables.get(0)),BigInteger.ONE));
        reject(()->SolanaMessageCompiler.compile(key(1),key(9),List.of(new SolanaMessageCompiler.Instruction(key(2),List.of(new SolanaMessageCompiler.Meta(key(3),true,false)),new byte[0])),List.of(),BigInteger.ONE));
        reject(()->SolanaMessageCompiler.compile(key(1),key(9),List.of(new SolanaMessageCompiler.Instruction(key(2),List.of(new SolanaMessageCompiler.Meta(key(2),false,true)),new byte[0])),List.of(),BigInteger.ONE));
        System.out.println("Solana compiler checks passed");
    }
}
