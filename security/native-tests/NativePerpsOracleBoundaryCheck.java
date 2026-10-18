package com.jamddmaj.ai.wallet;

/** Read-only check of the prepared wire; never signs or submits. */
public final class NativePerpsOracleBoundaryCheck {
    public static void main(String[] args)throws Exception{
        if(args.length!=3)throw new IllegalArgumentException("Expected public payer, asset and side");
        byte[] encoded=System.in.readNBytes(400001);
        if(encoded.length>400000)throw new IllegalArgumentException("Oversized diagnostic input");
        String[] lines=new String(encoded,java.nio.charset.StandardCharsets.US_ASCII).trim().split("\\r?\\n");
        if(lines.length<1||lines.length>33||lines[0].length()>2000)throw new IllegalArgumentException("Invalid diagnostic input");
        NativePerpsTransaction transaction=NativePerpsTransaction.decode(java.util.Base64.getDecoder().decode(lines[0]),args[0]);
        NativePerpsOracleBoundary.check(transaction.message);
        java.util.List<SolanaLookupTables.Account> tables=new java.util.ArrayList<>();
        for(int i=1;i<lines.length;i++){
            String[] fields=lines[i].split(" ");
            if(fields.length!=3)throw new IllegalArgumentException("Invalid public table snapshot");
            tables.add(new SolanaLookupTables.Account(DevnetSolana.decode(fields[0],32),SolanaLookupTables.PROGRAM,false,
                java.util.Base64.getDecoder().decode(fields[1]),new java.math.BigInteger(fields[2])));
        }
        SolanaLookupTables.Resolved keys=SolanaLookupTables.resolve(transaction.message,tables,java.math.BigInteger.ZERO);
        NativePerpsTokenBoundary.check(transaction.message,keys,args[1],Integer.parseInt(args[2]));
        System.out.println("ORACLE_CAPABILITIES_BOUNDED=true TOKEN_CLEANUP_BOUNDED=true SIGNING_AUTHORIZED=false");
    }
}
