package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.util.AtomicFile;
import android.util.Base64;
import java.io.*;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.json.JSONObject;

/** Local close identity and conversion reservation, never a grant to sign.
 * Separate from the latest-operation journal so TP/SL cleanup cannot erase it. */
final class NativePerpsSettlementStore {
    private static final Object LOCK=new Object();
    private final NativeWalletProfiles.Profile owner;
    private final File root,directory;
    static final class Close {
        final String signature,asset,message;
        final int side;
        final boolean nativeSol;
        final BigInteger minimumSlot,fee,locked,refunded;
        final JSONObject conversion;
        Close(JSONObject j,String payer)throws Exception{
            signature=j.getString("signature");DevnetSolana.decode(signature,64);
            asset=j.getString("asset");if(!("BTC".equals(asset)||"ETH".equals(asset)||"SOL".equals(asset)))throw invalid();NativePerpsCustody.mint(asset);
            Object s=j.get("side");if(!(s instanceof Integer)||((Integer)s!=1&&(Integer)s!=2))throw invalid();side=(Integer)s;
            Object n=j.get("nativeSol");if(!(n instanceof Boolean))throw invalid();nativeSol=(Boolean)n;
            if(nativeSol&&!(side==1&&"SOL".equals(asset)))throw invalid();
            message=j.getString("message");byte[] raw=decode(message);SolanaMessage m=SolanaMessage.parse(raw);
            if(m.signatures!=3||!payer.equals(DevnetSolana.encode(m.staticKey(0))))throw invalid();
            minimumSlot=units(j.get("minimumSlot"));fee=units(j.get("fee"));locked=units(j.get("locked"));refunded=units(j.get("refunded"));
            if(minimumSlot.signum()==0||fee.signum()==0||fee.compareTo(BigInteger.valueOf(1000000))>0||locked.compareTo(BigInteger.valueOf(30000000))>0||refunded.compareTo(BigInteger.valueOf(30000000))>0)throw invalid();
            conversion=j.has("conversion")?new JSONObject(j.getJSONObject("conversion").toString()):null;
            if(conversion!=null){
                DevnetSolana.decode(conversion.getString("signature"),64);
                SolanaMessage swap=SolanaMessage.parse(decode(conversion.getString("message")));
                if(swap.signatures!=1||!payer.equals(DevnetSolana.encode(swap.staticKey(0)))||units(conversion.get("amount")).signum()==0||units(conversion.get("minimum")).signum()==0)throw invalid();
            }
        }
        String receiveMint(){return NativePerpsCustody.mint(side==1?asset:"USDC");}
        int decimals(){return side==2?6:"SOL".equals(asset)?9:8;}
    }
    NativePerpsSettlementStore(Context context,NativeWalletProfiles.Profile owner)throws Exception{
        if(owner==null)throw invalid();this.owner=owner;root=context.getNoBackupFilesDir();
        directory=new File(root,"wallet-perps-settlement-v1/"+owner.ownerId);
        if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("Close receipt storage unavailable");
    }
    private AtomicFile file(String asset,int side){NativePerpsCustody.mint(asset);if(side!=1&&side!=2)throw invalid();return new AtomicFile(new File(directory,asset+"-"+side+".json"));}
    void remember(NativePerpsSignedEnvelope envelope,NativePerpsCloseIntent intent,NativePerpsCloseFunding amounts,BigInteger slot)throws Exception{
        if(!owner.solanaAddress.equals(envelope.payer)||!owner.solanaAddress.equals(intent.payer))throw invalid();
        JSONObject j=new JSONObject().put("version",1).put("owner",owner.ownerId).put("payer",owner.solanaAddress)
            .put("signature",envelope.transactionId).put("asset",intent.asset).put("side",intent.side)
            .put("message",Base64.encodeToString(Arrays.copyOfRange(envelope.bytes(),193,envelope.bytes().length),Base64.NO_WRAP))
            .put("minimumSlot",slot.toString()).put("nativeSol",amounts.nativeSol).put("fee",amounts.networkFee.toString())
            .put("locked",amounts.rentLocked.toString()).put("refunded",amounts.rentRefunded.toString());
        synchronized(LOCK){Close old=read(intent.asset,intent.side);if(old!=null&&old.signature.equals(envelope.transactionId))throw invalid();new Close(j,owner.solanaAddress);write(file(intent.asset,intent.side),j);}
    }
    Close latest(String asset,int side)throws Exception{synchronized(LOCK){return read(asset,side);}}
    void reserve(Close expected,String signature,NativeSwapService.Preview preview)throws Exception{
        synchronized(LOCK){
            Close current=read(expected.asset,expected.side);
            var p=preview.candidate.preparation;var i=p.intent;
            if(current==null||!current.signature.equals(expected.signature)||current.conversion!=null||!owner.solanaAddress.equals(i.payer)||!current.receiveMint().equals(i.inputMint)||!NativeSolanaTokens.USDC.equals(i.outputMint))throw invalid();
            JSONObject j=readJson(file(expected.asset,expected.side));
            j.put("conversion",new JSONObject().put("signature",signature).put("message",Base64.encodeToString(preview.candidate.message.bytes(),Base64.NO_WRAP))
                .put("amount",i.amount).put("minimum",p.minimumOut.toString()));
            new Close(j,owner.solanaAddress);write(file(expected.asset,expected.side),j);
        }
    }
    void requireAvailable(Close expected)throws Exception{
        synchronized(LOCK){Close c=read(expected.asset,expected.side);if(!same(c,expected)||c.conversion!=null)throw invalid();}
    }
    /** Only after separately verifying finalized failure, and only on a fresh
     * explicit user review. Unknown/confirmed/successful attempts stay reserved. */
    void releaseFailed(Close expected)throws Exception{
        synchronized(LOCK){Close c=read(expected.asset,expected.side);if(!same(c,expected)||c.conversion==null||expected.conversion==null||!c.conversion.toString().equals(expected.conversion.toString()))throw invalid();
            JSONObject j=readJson(file(expected.asset,expected.side));j.remove("conversion");write(file(expected.asset,expected.side),j);}
    }
    private static boolean same(Close a,Close b){return a!=null&&b!=null&&a.signature.equals(b.signature)&&a.message.equals(b.message)&&a.asset.equals(b.asset)&&a.side==b.side&&a.nativeSol==b.nativeSol&&a.minimumSlot.equals(b.minimumSlot)&&a.fee.equals(b.fee)&&a.locked.equals(b.locked)&&a.refunded.equals(b.refunded);}
    private Close read(String asset,int side)throws Exception{
        JSONObject j=readJson(file(asset,side));if(j==null)return null;
        if(!Integer.valueOf(1).equals(j.get("version"))||!owner.ownerId.equals(j.getString("owner"))||!owner.solanaAddress.equals(j.getString("payer")))throw invalid();
        Close c=new Close(j,owner.solanaAddress);if(!asset.equals(c.asset)||side!=c.side)throw invalid();return c;
    }
    private JSONObject readJson(AtomicFile f)throws Exception{
        try(FileInputStream in=f.openRead()){return new JSONObject(new String(DevnetWalletService.readBounded(in,8192),StandardCharsets.UTF_8));}
        catch(FileNotFoundException absent){if(f.getBaseFile().exists()||new File(f.getBaseFile()+".bak").exists()||new File(f.getBaseFile()+".new").exists())throw absent;return null;}
    }
    private void write(AtomicFile f,JSONObject j)throws Exception{
        byte[] data=j.toString().getBytes(StandardCharsets.UTF_8);if(data.length>8192)throw invalid();FileOutputStream out=null;
        try{out=f.startWrite();out.write(data);out.getFD().sync();f.finishWrite(out);out=null;
            try(FileInputStream in=f.openRead()){if(!Arrays.equals(data,DevnetWalletService.readBounded(in,8192)))throw invalid();}
            WalletStorageBarrier.syncParents(f.getBaseFile(),root);
        }catch(Exception failure){if(out!=null)f.failWrite(out);throw failure;}
    }
    static byte[] decode(String encoded){if(encoded==null||encoded.length()>1644)throw invalid();byte[] bytes=Base64.decode(encoded,Base64.NO_WRAP);if(!encoded.equals(Base64.encodeToString(bytes,Base64.NO_WRAP)))throw invalid();return bytes;}
    static BigInteger units(Object n){if(!(n instanceof String||n instanceof Integer||n instanceof Long)||!n.toString().matches("0|[1-9][0-9]{0,19}"))throw invalid();BigInteger b=new BigInteger(n.toString());if(b.bitLength()>64)throw invalid();return b;}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Native close receipt unavailable or already reserved");}
}
