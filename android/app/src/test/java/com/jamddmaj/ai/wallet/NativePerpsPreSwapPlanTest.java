package com.jamddmaj.ai.wallet;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.util.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsPreSwapPlanTest {
    static final class Fixture {
        final NativePerpsPreSwapBindingsTest.Fixture route;
        final List<byte[][]> roles=new ArrayList<>();final List<byte[]> data=new ArrayList<>();
        NativePerpsOrderIntent intent=new NativePerpsOrderIntent("SOL",1,"10","2",50,"105",null,null);
        SolanaMessage message;SolanaLookupTables.Resolved resolved;
        byte[] lookup,table;
        String extraProgram;byte[][] extraAccounts;byte[] extraData;
        Fixture(){this(false);}
        Fixture(boolean signable){
            route=signable?new NativePerpsPreSwapBindingsTest.Fixture(NativePerpsTransactionTest.publicKey(1),NativePerpsTransactionTest.publicKey(2),NativePerpsTransactionTest.publicKey(3)):new NativePerpsPreSwapBindingsTest.Fixture();
            route.opening[6]=NativePerpsAddresses.position(key(route.opening[2]),"SOL",1);
            route.opening[7]=DevnetSolana.decode(route.output.address,32);
            route.opening[8]=route.opening[9]=DevnetSolana.decode(route.output.dovesAgOracle,32);
            route.opening[12]=DevnetSolana.decode(route.output.dovesAgOracle,32);
            route.opening[17]=DevnetSolana.decode(NativePerpsFunding.SYSTEM,32);
            route.opening[15]=DevnetSolana.decode(NativePerpsCustody.PROGRAM,32);
            roles.add(route.ledger);roles.add(route.swap);roles.add(route.opening);
            data.add(NativePerpsPreSwapDataTest.ledger());data.add(NativePerpsPreSwapDataTest.swap(10000000,95000000));data.add(NativePerpsInstructionDataTest.increase(false));
        }
        void compile(){
            List<byte[]> statics=new ArrayList<>(Arrays.asList(route.opening[2],route.opening[0],route.opening[1],DevnetSolana.decode(NativePerpsCustody.PROGRAM,32),DevnetSolana.decode("ComputeBudget111111111111111111111111111111",32)));
            if(extraProgram!=null)statics.add(DevnetSolana.decode(extraProgram,32));
            Set<String> writable=new HashSet<>();writable.add(key(route.ledger[0]));writable.add(key(route.opening[6]));
            for(int role:new int[]{1,2,5,6,8,9,11})writable.add(key(route.swap[role]));
            Map<String,byte[]> extra=new LinkedHashMap<>();Set<String> known=new HashSet<>();for(byte[] value:statics)known.add(key(value));
            for(byte[][] instruction:roles)for(byte[] value:instruction)if(!known.contains(key(value)))extra.put(key(value),value);
            if(extraAccounts!=null)for(byte[] value:extraAccounts)if(!known.contains(key(value)))extra.put(key(value),value);
            List<byte[]> loaded=new ArrayList<>();
            for(boolean wanted:new boolean[]{true,false})for(byte[] value:extra.values())if(writable.contains(key(value))==wanted)loaded.add(value);
            int writableCount=0;for(byte[] value:loaded)if(writable.contains(key(value)))writableCount++;
            List<byte[]> all=new ArrayList<>(statics);all.addAll(loaded);Map<String,Integer> indexes=new HashMap<>();
            for(int i=0;i<all.size();i++)indexes.put(key(all.get(i)),i);
            ByteArrayOutputStream out=new ByteArrayOutputStream();out.writeBytes(new byte[]{(byte)128,3,2,(byte)(statics.size()-3),(byte)statics.size()});
            for(byte[] value:statics)out.writeBytes(value);out.writeBytes(new byte[32]);out.write(roles.size()+2+(extraProgram==null?0:1));
            out.writeBytes(new byte[]{4,0,5,2,(byte)128,26,6,0}); // 400000 CU
            out.writeBytes(new byte[]{4,0,9,3,0,0,0,0,0,0,0,0}); // explicit zero priority fee
            for(int i=0;i<roles.size();i++){
                out.write(3);out.write(roles.get(i).length);for(byte[] value:roles.get(i))out.write(indexes.get(key(value)));
                out.write(data.get(i).length);out.writeBytes(data.get(i));
            }
            if(extraProgram!=null){
                out.write(5);out.write(extraAccounts.length);for(byte[] value:extraAccounts)out.write(indexes.get(key(value)));
                out.write(extraData.length);out.writeBytes(extraData);
            }
            lookup=new byte[32];lookup[0]=(byte)245;out.write(1);out.writeBytes(lookup);
            out.write(writableCount);for(int i=0;i<writableCount;i++)out.write(i);
            out.write(loaded.size()-writableCount);for(int i=writableCount;i<loaded.size();i++)out.write(i);
            message=SolanaMessage.parse(out.toByteArray());
            table=new byte[56+32*loaded.size()];table[0]=1;Arrays.fill(table,4,12,(byte)255);
            for(int i=0;i<loaded.size();i++)System.arraycopy(loaded.get(i),0,table,56+32*i,32);
            resolved=SolanaLookupTables.resolve(message,Collections.singletonList(new SolanaLookupTables.Account(lookup,SolanaLookupTables.PROGRAM,false,table,BigInteger.ONE)),BigInteger.ZERO);
        }
        NativePerpsPreSwapPlan.LedgerRequirement check(){compile();return NativePerpsPreSwapPlan.inspect(message,resolved,intent,route.input,route.output);}
        static String key(byte[] value){return DevnetSolana.encode(value);}
    }
    @Test public void validatesWholeDecodedLongPlanAndReturnsBoundLedger(){
        Fixture fixture=new Fixture();NativePerpsPreSwapPlan.LedgerRequirement result=fixture.check();
        assertEquals(Fixture.key(fixture.route.ledger[0]),result.address);
        assertEquals(Fixture.key(fixture.route.swap[2]),result.tokenAccount);
        assertEquals(0,NativePerpsAccountBindings.checkOpeningTransaction(fixture.message,fixture.resolved));
    }
    @Test public void rejectsReorderingDuplicateMissingAndPostOpeningAuxiliary(){
        for(int mutation=0;mutation<4;mutation++){
            Fixture fixture=new Fixture();
            if(mutation==0){Collections.swap(fixture.roles,0,1);Collections.swap(fixture.data,0,1);}
            if(mutation==1){fixture.roles.add(0,fixture.route.ledger);fixture.data.add(0,NativePerpsPreSwapDataTest.ledger());}
            if(mutation==2){fixture.roles.remove(0);fixture.data.remove(0);}
            if(mutation==3){fixture.roles.add(fixture.route.ledger);fixture.data.add(NativePerpsPreSwapDataTest.ledger());}
            assertThrows(IllegalArgumentException.class,fixture::check);
        }
    }
    @Test public void rejectsExtraInputWeakOutputAndNonLedgerOpening(){
        for(byte[] bad:new byte[][]{NativePerpsPreSwapDataTest.swap(10000001,95000000),NativePerpsPreSwapDataTest.swap(10000000,94761904)}){
            Fixture fixture=new Fixture();fixture.data.set(1,bad);assertThrows(IllegalArgumentException.class,fixture::check);
        }
        Fixture fixture=new Fixture();fixture.data.set(2,NativePerpsInstructionDataTest.increase(true));assertThrows(IllegalArgumentException.class,fixture::check);
    }
    @Test public void roundsNativeOutputFloorUpWithoutFloatingPoint(){
        Fixture fixture=new Fixture();
        assertEquals(BigInteger.valueOf(94761905),NativePerpsPreSwapPlan.minimumOutput(fixture.intent,9));
        assertThrows(IllegalArgumentException.class,()->NativePerpsPreSwapPlan.minimumOutput(fixture.intent,19));
    }
    @Test public void rejectsUnreviewedReferralAndChangedLedgerDestination(){
        Fixture fixture=new Fixture();fixture.route.opening[15]=fixture.route.opening[0];assertThrows(IllegalArgumentException.class,fixture::check);
        Fixture other=new Fixture();other.route.ledger[1]=other.route.swap[1];assertThrows(IllegalArgumentException.class,other::check);
    }
    static void configureShort(Fixture fixture){
        fixture.intent=new NativePerpsOrderIntent("SOL",2,"10","2",50,"105",null,null);
        byte[][] opening=fixture.route.opening;
        opening[3]=fixture.route.swap[1];opening[10]=DevnetSolana.decode(fixture.route.input.address,32);
        opening[11]=opening[12]=DevnetSolana.decode(fixture.route.input.dovesAgOracle,32);
        opening[13]=DevnetSolana.decode(fixture.route.input.tokenAccount,32);
        opening[14]=DevnetSolana.decode(NativePerpsCustody.PROGRAM,32);
        opening[6]=NativePerpsAddresses.position(Fixture.key(opening[2]),"SOL",2);
        byte[] data=NativePerpsInstructionDataTest.increase(true);data[25]=2;
        fixture.roles.clear();fixture.data.clear();fixture.roles.add(opening);fixture.data.add(data);
    }
    @Test public void supportsExactUsdcShortWithoutPreSwapOrLedger(){
        Fixture fixture=new Fixture();configureShort(fixture);fixture.compile();
        assertNull(NativePerpsPreSwapPlan.inspect(fixture.message,fixture.resolved,fixture.intent,fixture.route.input,fixture.route.input));
        NativePerpsInstructionPolicy.check(fixture.message,fixture.resolved,fixture.intent);
        fixture.data.get(0)[17]^=1;fixture.compile();
        assertThrows(IllegalArgumentException.class,()->NativePerpsPreSwapPlan.inspect(fixture.message,fixture.resolved,fixture.intent,fixture.route.input,fixture.route.input));
    }
}
