package com.jamddmaj.ai.wallet;

import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Complete top-level collateral-first close boundary. This still cannot sign:
 * same-bank position/payout/funding/protocol effects and durability are required. */
final class NativePerpsClosePolicy {
    private static final String ATA="ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
    private static final String ED="Ed25519SigVerify111111111111111111111111111";
    private static final String COMPUTE="ComputeBudget111111111111111111111111111111";
    private NativePerpsClosePolicy(){}
    static void check(NativePerpsTransaction transaction,SolanaLookupTables.Resolved keys,NativePerpsCloseIntent intent,
            NativePerpsCustody market,NativePerpsCustody collateral,NativePerpsCloseOracleContext context,long now){
        NativePerpsCloseBindings binding=NativePerpsCloseBindings.check(transaction,keys,intent,market,collateral,now);
        SolanaMessage message=transaction.message;NativePerpsComputeBudget.check(message);NativePerpsOracleBoundary.check(message);
        Set<String> writes=new HashSet<>(Arrays.asList(intent.payer,DevnetSolana.encode(keys.key(1)),NativePerpsCustody.POOL,intent.positionAddress,
            binding.collateralAccount,market.address,collateral.address,collateral.tokenAccount,market.dovesAgOracle,collateral.dovesAgOracle));
        if(binding.requestAddress!=null){writes.add(binding.requestAddress);writes.add(binding.requestAccount);}
        if(context!=null){writes.addAll(context.lazerFeeds);writes.add(NativePerpsCloseOracleData.TREASURY);}
        for(int i=0;i<keys.size();i++)if(message.isWritable(i)&&!writes.contains(DevnetSolana.encode(keys.key(i))))throw invalid();
        Map<String,String[]> targets=new HashMap<>();targets.put(binding.collateralAccount,new String[]{intent.payer,collateral.mint});
        if(binding.requestAccount!=null)targets.put(binding.requestAccount,new String[]{binding.requestAddress,collateral.mint});
        Set<String> created=new HashSet<>();boolean closed=false;
        for(int index=0;index<message.instructions.size();index++){
            SolanaMessage.Instruction ix=message.instructions.get(index);String program=DevnetSolana.encode(keys.key(ix.program));byte[] roles=ix.accounts(),data=ix.data();
            if(message.isSigner(ix.program)||message.isWritable(ix.program))throw invalid();
            if(COMPUTE.equals(program))continue;
            if(ED.equals(program)){if(index>=binding.instructionIndex)throw invalid();NativePerpsCloseOracleData.checkSignatures(message,keys,index);continue;}
            if(NativePerpsCloseOracleContext.DOVES.equals(program)){
                if(context==null||index>=binding.instructionIndex)throw invalid();for(byte role:roles)if((role&255)==0)throw invalid();
                if(tag(data,new byte[]{(byte)203,59,95,(byte)176,(byte)236,21,73,(byte)153})){
                    if(roles.length<7||roles.length>8||(roles[0]&255)!=1)throw invalid();
                    String[] expected={DevnetSolana.encode(keys.key(1)),NativePerpsCloseOracleData.STORAGE,NativePerpsCloseOracleData.TREASURY,
                        NativePerpsCloseOracleData.PYTH,NativePerpsFunding.SYSTEM,"Sysvar1nstructions1111111111111111111111111"};
                    Map<Long,Integer> feeds=new HashMap<>();Set<String> unique=new HashSet<>();
                    for(int role=0;role<roles.length;role++){
                        int account=roles[role]&255;String address=DevnetSolana.encode(keys.key(account));
                        if(message.isSigner(account)!=(role==0)||message.isWritable(account)!=(role==0||role==2||role>=6))throw invalid();
                        if(role<6){if(!expected[role].equals(address))throw invalid();}
                        else{
                            if(!context.lazerFeeds.contains(address)||!unique.add(address))throw invalid();
                            for(NativePerpsCloseOracleContext.Feed feed:context.feeds.values())if(feed.lazer.equals(address)){
                                Integer previous=feeds.put(feed.id,feed.channel);if(previous!=null&&previous!=feed.channel)throw invalid();
                            }
                        }
                    }
                    NativePerpsCloseOracleData.checkUpdate(message,keys,index,context.storage,feeds,now);
                }else if(tag(data,new byte[]{61,65,60,(byte)229,(byte)235,(byte)142,(byte)250,117})){
                    if(data.length!=8||roles.length!=5||(roles[0]&255)!=1)throw invalid();
                    NativePerpsCloseOracleContext.Feed feed=context.feeds.get(DevnetSolana.encode(keys.key(roles[1]&255)));
                    if(feed==null||!feed.lazer.equals(DevnetSolana.encode(keys.key(roles[2]&255)))||!feed.chainlink.equals(DevnetSolana.encode(keys.key(roles[3]&255)))
                            ||!feed.redstone.equals(DevnetSolana.encode(keys.key(roles[4]&255))))throw invalid();
                    for(int role=1;role<5;role++)if(message.isSigner(roles[role]&255)||role==1&&!message.isWritable(roles[role]&255)||role>=3&&message.isWritable(roles[role]&255))throw invalid();
                }else throw invalid();
                continue;
            }
            if(ATA.equals(program)){
                if(data.length!=1||data[0]!=1||roles.length!=6||(roles[0]&255)!=0||index>binding.instructionIndex)throw invalid();
                String address=DevnetSolana.encode(keys.key(roles[1]&255));String[] target=targets.get(address);
                if(target==null||!created.add(address)||!message.isWritable(roles[1]&255)||message.isSigner(roles[1]&255)
                        ||!target[0].equals(DevnetSolana.encode(keys.key(roles[2]&255)))||!target[1].equals(DevnetSolana.encode(keys.key(roles[3]&255)))
                        ||!NativePerpsFunding.SYSTEM.equals(DevnetSolana.encode(keys.key(roles[4]&255)))||!SplTokenAccount.PROGRAM.equals(DevnetSolana.encode(keys.key(roles[5]&255))))throw invalid();
                for(int role:new int[]{3,4,5})if(message.isSigner(roles[role]&255)||message.isWritable(roles[role]&255))throw invalid();continue;
            }
            if(SplTokenAccount.PROGRAM.equals(program)){
                if(intent.side!=1||!"SOL".equals(intent.asset)||index<=binding.instructionIndex||closed||data.length!=1||data[0]!=9||roles.length!=3
                        ||(roles[1]&255)!=0||(roles[2]&255)!=0||!binding.collateralAccount.equals(DevnetSolana.encode(keys.key(roles[0]&255)))||!message.isWritable(roles[0]&255))throw invalid();
                closed=true;continue;
            }
            if(!NativePerpsCustody.PROGRAM.equals(program)||index!=binding.instructionIndex)throw invalid();
        }
    }
    private static boolean tag(byte[] data,byte[] tag){return data.length>=8&&Arrays.equals(Arrays.copyOf(data,8),tag);}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Unsupported native full-close instruction or account capability");}
}
