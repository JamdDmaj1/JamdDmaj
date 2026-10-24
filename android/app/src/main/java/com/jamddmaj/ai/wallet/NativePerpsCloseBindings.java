package com.jamddmaj.ai.wallet;

import java.util.Arrays;

/** Account identities for collateral-first full closes. Not an instruction
 * allowlist, simulation proof, fresh position proof or signing authorization. */
final class NativePerpsCloseBindings {
    private static final String ATA="ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
    private static final String SYSTEM="11111111111111111111111111111111";
    final NativePerpsCloseIntent.Core core;
    final int instructionIndex;
    final String collateralAccount,requestAddress,requestAccount;
    private NativePerpsCloseBindings(NativePerpsCloseIntent.Core core,int index,String collateralAccount,String request,String requestAccount){
        this.core=core;instructionIndex=index;this.collateralAccount=collateralAccount;requestAddress=request;this.requestAccount=requestAccount;
    }
    static NativePerpsCloseBindings check(NativePerpsTransaction transaction,SolanaLookupTables.Resolved keys,
            NativePerpsCloseIntent intent,NativePerpsCustody market,NativePerpsCustody collateral,long now){
        if(transaction==null||keys==null||intent==null||market==null||collateral==null
                ||!market.asset.equals(intent.asset)||!collateral.asset.equals(intent.receiveToken)
                ||!market.allowDecrease||!collateral.allowDecrease)throw invalid();
        SolanaMessage message=transaction.message;
        if(keys.size()!=message.accountCount||!intent.payer.equals(DevnetSolana.encode(keys.key(0))))throw invalid();
        for(int i=0;i<message.staticAccountCount();i++)if(!Arrays.equals(keys.key(i),message.staticKey(i)))throw invalid();
        for(int i=0;i<keys.size();i++)for(int j=0;j<i;j++)if(Arrays.equals(keys.key(i),keys.key(j)))throw invalid();
        String recipient=DevnetSolana.encode(NativePerpsTokenBoundary.associated(keys.key(0),collateral.mint));
        NativePerpsCloseBindings result=null;
        for(int index=0;index<message.instructions.size();index++){
            SolanaMessage.Instruction instruction=message.instructions.get(index);
            if(!NativePerpsCustody.PROGRAM.equals(DevnetSolana.encode(keys.key(instruction.program))))continue;
            if(result!=null||message.isWritable(instruction.program)||message.isSigner(instruction.program))throw invalid();
            NativePerpsCloseIntent.Core core=intent.checkCore(instruction.data(),now);
            byte[] accounts=instruction.accounts();
            if(accounts.length!=22||(accounts[0]&255)!=1||(accounts[1]&255)!=2||(accounts[2]&255)!=0)throw invalid();
            String[] roles=new String[22];for(int role=0;role<22;role++)roles[role]=DevnetSolana.encode(keys.key(accounts[role]&255));
            String transfer=DevnetSolana.encode(NativePerpsAddresses.transferAuthority()),perpetuals=DevnetSolana.encode(NativePerpsAddresses.perpetuals()),event=DevnetSolana.encode(NativePerpsAddresses.eventAuthority());
            String request=null,requestAccount=null;String[] expected;
            if(core.variant2){
                byte[] requestKey=NativePerpsAddresses.exitRequest(DevnetSolana.decode(intent.positionAddress,32),core.counter);
                request=DevnetSolana.encode(requestKey);requestAccount=DevnetSolana.encode(NativePerpsTokenBoundary.associated(requestKey,collateral.mint));
                expected=new String[]{roles[0],roles[1],intent.payer,recipient,transfer,perpetuals,NativePerpsCustody.POOL,intent.positionAddress,
                    market.address,market.dovesAgOracle,collateral.address,collateral.dovesAgOracle,collateral.tokenAccount,collateral.mint,
                    NativePerpsCustody.PROGRAM,request,requestAccount,SplTokenAccount.PROGRAM,ATA,SYSTEM,event,NativePerpsCustody.PROGRAM};
            }else{
                if(!priceAccount(roles[10],market)||!priceAccount(roles[13],collateral))throw invalid();
                expected=new String[]{roles[0],roles[1],intent.payer,recipient,transfer,perpetuals,NativePerpsCustody.POOL,intent.positionAddress,
                    market.address,market.dovesAgOracle,roles[10],collateral.address,collateral.dovesAgOracle,roles[13],collateral.tokenAccount,collateral.mint,
                    NativePerpsCustody.PROGRAM,SplTokenAccount.PROGRAM,ATA,SYSTEM,event,NativePerpsCustody.PROGRAM};
            }
            if(!Arrays.equals(roles,expected))throw invalid();
            int[] mutable=core.variant2?new int[]{2,3,6,7,8,10,12,15,16}:new int[]{2,3,6,7,8,11,14};
            int[] oracles=core.variant2?new int[]{9,11}:new int[]{9,10,12,13};
            for(int role=0;role<22;role++){
                int account=accounts[role]&255;
                if(message.isSigner(account)!=(role<3))throw invalid();
                if(role==0||contains(oracles,role))continue;
                if(message.isWritable(account)!=contains(mutable,role))throw invalid();
            }
            result=new NativePerpsCloseBindings(core,index,recipient,request,requestAccount);
        }
        if(result==null)throw invalid();return result;
    }
    private static boolean priceAccount(String address,NativePerpsCustody custody){return address.equals(custody.oracle)||address.equals(custody.dovesAgOracle);}
    private static boolean contains(int[] values,int value){for(int item:values)if(item==value)return true;return false;}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Full close account identities differ from native position");}
}
