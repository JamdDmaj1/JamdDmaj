package com.jamddmaj.ai.wallet;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Single-request cancellation only. No price updates, swaps or token authority changes. */
final class NativePerpsCancelPolicy {
    private static final String ATA="ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",COMPUTE="ComputeBudget111111111111111111111111111111";
    static void check(NativePerpsTransaction transaction,SolanaLookupTables.Resolved keys,NativePerpsCancelIntent intent){
        if(transaction==null||keys==null||intent==null||keys.size()!=transaction.message.accountCount||!intent.payer.equals(DevnetSolana.encode(keys.key(0))))throw invalid();
        SolanaMessage message=transaction.message;NativePerpsComputeBudget.check(message);
        for(int i=0;i<message.staticAccountCount();i++)if(!Arrays.equals(message.staticKey(i),keys.key(i)))throw invalid();
        Set<String> distinct=new HashSet<>();for(int i=0;i<keys.size();i++)if(!distinct.add(DevnetSolana.encode(keys.key(i))))throw invalid();
        String keeper=DevnetSolana.encode(keys.key(1)),event=DevnetSolana.encode(NativePerpsAddresses.eventAuthority());
        Set<String> writable=new HashSet<>(Arrays.asList(intent.payer,keeper,intent.ownerAta,NativePerpsCustody.POOL,intent.requestAddress,intent.requestAta));
        for(int i=0;i<keys.size();i++)if(message.isWritable(i)&&!writable.contains(DevnetSolana.encode(keys.key(i))))throw invalid();
        int cancellations=0,created=0;
        for(SolanaMessage.Instruction ix:message.instructions){
            String program=DevnetSolana.encode(keys.key(ix.program));if(message.isSigner(ix.program)||message.isWritable(ix.program))throw invalid();
            byte[] data=ix.data(),indexes=ix.accounts();String[] roles=new String[indexes.length];for(int i=0;i<roles.length;i++)roles[i]=DevnetSolana.encode(keys.key(indexes[i]&255));
            if(COMPUTE.equals(program))continue;
            if(ATA.equals(program)){
                String[] expected={intent.payer,intent.ownerAta,intent.payer,NativePerpsFunding.USDC,NativePerpsFunding.SYSTEM,SplTokenAccount.PROGRAM};
                if(cancellations!=0||++created!=1||data.length!=1||data[0]!=1||!Arrays.equals(roles,expected))throw invalid();
                for(int role=0;role<roles.length;role++)if(message.isSigner(indexes[role]&255)!=(role==0||role==2)||message.isWritable(indexes[role]&255)!=(role<3))throw invalid();
                continue;
            }
            if(!NativePerpsCustody.PROGRAM.equals(program)||++cancellations!=1||data.length!=8)throw invalid();
            boolean v2=Arrays.equals(data,new byte[]{121,68,(byte)162,28,(byte)216,47,(byte)200,66});
            boolean v1=Arrays.equals(data,new byte[]{40,105,(byte)217,(byte)188,(byte)220,45,109,110});
            String[] expected=v1?new String[]{keeper,intent.payer,intent.ownerAta,NativePerpsCustody.POOL,intent.requestAddress,intent.requestAta,intent.positionAddress,SplTokenAccount.PROGRAM,event,NativePerpsCustody.PROGRAM}
                :v2?new String[]{keeper,intent.payer,intent.ownerAta,NativePerpsCustody.POOL,intent.requestAddress,intent.requestAta,intent.positionAddress,NativePerpsFunding.USDC,SplTokenAccount.PROGRAM,NativePerpsFunding.SYSTEM,ATA,event,NativePerpsCustody.PROGRAM}:null;
            if(expected==null||!Arrays.equals(expected,roles)||(indexes[0]&255)!=1||(indexes[1]&255)!=0||v2&&!message.isWritable(1))throw invalid();
            for(int role=0;role<roles.length;role++){
                int index=indexes[role]&255;if(message.isSigner(index)!=(role<2))throw invalid();
                if(role!=0&&message.isWritable(index)!=writable.contains(roles[role]))throw invalid();
            }
        }
        if(cancellations!=1)throw invalid();
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Unsupported TP/SL cancellation instruction or account capability");}
}
