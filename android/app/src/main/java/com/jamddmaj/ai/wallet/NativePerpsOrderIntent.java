package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.List;

/** Immutable native review limits, not a spending/signing approval. Funding
 * debit, oracle authenticity, fees and resulting leverage still require chain
 * state and simulation checks. All money/price arithmetic is integer based. */
final class NativePerpsOrderIntent {
    final String asset;
    final int side,leverageTenths,maxSlippageBps;
    final BigInteger marginUsd,referencePrice,stopLoss,takeProfit,maxSizeUsd;
    NativePerpsOrderIntent(String asset,int side,String marginUsd,String leverage,int slippageBps,
            String referencePrice,String stopLoss,String takeProfit){
        if(!("SOL".equals(asset)||"BTC".equals(asset)||"ETH".equals(asset))||(side!=1&&side!=2))throw invalid();
        this.asset=asset;this.side=side;this.marginUsd=usd(marginUsd);this.referencePrice=usd(referencePrice);
        if(this.marginUsd.compareTo(BigInteger.valueOf(10000000))<0||leverage==null||!leverage.matches("[1-9][0-9]?(\\.[0-9])?"))throw invalid();
        String[] parts=leverage.split("\\.");leverageTenths=Integer.parseInt(parts[0])*10+(parts.length==2?Integer.parseInt(parts[1]):0);
        if(leverageTenths<11||leverageTenths>500||slippageBps<1||slippageBps>100)throw invalid();
        this.maxSlippageBps=slippageBps;this.stopLoss=stopLoss==null?null:usd(stopLoss);this.takeProfit=takeProfit==null?null:usd(takeProfit);
        if(this.stopLoss!=null&&!correctDirection(this.stopLoss,false))throw invalid();
        if(this.takeProfit!=null&&!correctDirection(this.takeProfit,true))throw invalid();
        maxSizeUsd=this.marginUsd.multiply(BigInteger.valueOf(leverageTenths)).divide(BigInteger.TEN);
    }
    private boolean correctDirection(BigInteger price,boolean profit){
        int compare=price.compareTo(referencePrice);
        return compare!=0&&(compare>0)==((side==1)==profit);
    }
    /** nowSeconds must come from the authenticated, monotonic native quote clock,
     * not an adjustable phone calendar or a timestamp in provider JSON. */
    void checkInstructions(List<NativePerpsInstructionData> instructions,long nowSeconds){
        if(instructions==null||instructions.isEmpty()||instructions.size()>3||nowSeconds<30||nowSeconds>Long.MAX_VALUE-2)throw invalid();
        NativePerpsInstructionData open=instructions.get(0);
        if(open==null||open.kind!=NativePerpsInstructionData.Kind.INCREASE||open.side!=side||open.sizeUsd.compareTo(maxSizeUsd)>0)throw invalid();
        BigInteger limit=referencePrice.multiply(BigInteger.valueOf(side==1?10000+maxSlippageBps:10000-maxSlippageBps));
        // A price uses integer micro-USD: round a long cap upward and a short
        // floor downward by at most one micro-unit, never by a floating epsilon.
        if(side==1)limit=limit.add(BigInteger.valueOf(9999));
        limit=limit.divide(BigInteger.valueOf(10000));
        if(side==1?open.price.compareTo(limit)>0:open.price.compareTo(limit)<0)throw invalid();
        boolean sl=false,tp=false;
        for(int i=0;i<instructions.size();i++){
            NativePerpsInstructionData data=instructions.get(i);
            if(data==null||data.requestTime<nowSeconds-30||data.requestTime>nowSeconds+2)throw invalid();
            if(i==0)continue;
            // The live API protects precisely the newly added size, not an
            // unlimited entire-position exit that could close prior exposure.
            if(data.kind!=NativePerpsInstructionData.Kind.TPSL||!Boolean.FALSE.equals(data.entirePosition)
                    ||data.collateral.signum()!=0||!data.sizeUsd.equals(open.sizeUsd))throw invalid();
            boolean isProfit=Boolean.TRUE.equals(data.triggerAbove)==(side==1);
            if(isProfit){if(tp||takeProfit==null||!takeProfit.equals(data.price))throw invalid();tp=true;}
            else {if(sl||stopLoss==null||!stopLoss.equals(data.price))throw invalid();sl=true;}
        }
        if(sl!=(stopLoss!=null)||tp!=(takeProfit!=null))throw invalid();
    }
    static BigInteger usd(String value){
        if(value==null||!value.matches("(0|[1-9][0-9]{0,8})(\\.[0-9]{1,6})?"))throw invalid();
        String[] parts=value.split("\\.");String fraction=parts.length==2?parts[1]:"";
        BigInteger units=new BigInteger(parts[0]).multiply(BigInteger.valueOf(1000000)).add(new BigInteger((fraction+"000000").substring(0,6)));
        if(units.signum()<=0)throw invalid();return units;
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Perps instruction differs from native order intent");}
}
