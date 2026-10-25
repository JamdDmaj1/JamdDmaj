package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.util.AtomicFile;
import java.io.*;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.json.JSONObject;

/** Durable pre-broadcast record. A timeout is UNKNOWN, never permission to resend. */
public final class NativeTransferJournal {
    private static final Object LOCK = new Object();
    public enum Phase { UNKNOWN, SUBMITTED, CONFIRMED, FAILED }
    private final NativeWalletProfiles.Profile owner;
    private final WalletNetwork network;
    private final AtomicFile file;
    private final File privateRoot;

    public NativeTransferJournal(Context context, NativeWalletProfiles.Profile owner, WalletNetwork network) throws IOException {
        if (owner == null || network == null || !network.realFunds) throw new IllegalArgumentException("Production wallet and network required");
        this.owner = owner; this.network = network;
        privateRoot=context.getNoBackupFilesDir();
        File directory = new File(context.getNoBackupFilesDir(), "wallet-transfers-v1/" + owner.ownerId);
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Transaction storage unavailable");
        file = new AtomicFile(new File(directory, network.storageDomain + ".json"));
    }

    public static final class Record {
        public final String transactionId, recipient;
        public final BigInteger units, maximumFee;
        public final Phase phase;
        public final String inputMint,outputMint;
        public final BigInteger minimumOutput;
        public final String tokenMint;
        public final Perps perps;
        private final long createdAt;
        private Record(String transactionId, String recipient, BigInteger units, BigInteger maximumFee, Phase phase, long createdAt) {
            this(transactionId,recipient,units,maximumFee,phase,createdAt,null,null,null);
        }
        private Record(String transactionId,String recipient,BigInteger units,BigInteger maximumFee,Phase phase,long createdAt,String inputMint,String outputMint,BigInteger minimumOutput) {
            this(transactionId,recipient,units,maximumFee,phase,createdAt,inputMint,outputMint,minimumOutput,null);
        }
        private Record(String transactionId,String recipient,BigInteger units,BigInteger maximumFee,Phase phase,long createdAt,String inputMint,String outputMint,BigInteger minimumOutput,String tokenMint) {
            this(transactionId,recipient,units,maximumFee,phase,createdAt,inputMint,outputMint,minimumOutput,tokenMint,null);
        }
        private Record(String transactionId,String recipient,BigInteger units,BigInteger maximumFee,Phase phase,long createdAt,String inputMint,String outputMint,BigInteger minimumOutput,String tokenMint,Perps perps) {
            this.transactionId = transactionId; this.recipient = recipient; this.units = units;
            this.maximumFee = maximumFee; this.phase = phase; this.createdAt = createdAt;
            this.inputMint=inputMint; this.outputMint=outputMint; this.minimumOutput=minimumOutput;
            this.tokenMint=tokenMint;
            this.perps=perps;
        }
        public boolean pending() { return phase == Phase.UNKNOWN || phase == Phase.SUBMITTED; }
    }

    /** Descriptive identity, never signing authority. Entry units are margin;
     * FULL_CLOSE units are removed exposure (USD micro-units); CANCEL_TPSL
     * units are a count of one request, never a monetary debit. */
    public static final class Perps {
        public final String asset,position,signedWireSha256,operation;
        public final BigInteger minimumSlot;
        public final String requestAddress;public final BigInteger requestCounter;
        public final int side;
        private Perps(String asset,int side,String position,String digest,String payer){
            this(asset,side,position,digest,payer,"INCREASE",BigInteger.ZERO);
        }
        private Perps(String asset,int side,String position,String digest,String payer,String operation,BigInteger minimumSlot){
            this(asset,side,position,digest,payer,operation,minimumSlot,null,null);
        }
        private Perps(String asset,int side,String position,String digest,String payer,String operation,BigInteger minimumSlot,String request,BigInteger counter){
            if(!("BTC".equals(asset)||"ETH".equals(asset)||"SOL".equals(asset))||(side!=1&&side!=2)
                    ||digest==null||!digest.matches("[0-9a-f]{64}")
                    ||!DevnetSolana.encode(NativePerpsAddresses.position(payer,asset,side)).equals(position)||!("INCREASE".equals(operation)||"FULL_CLOSE".equals(operation)||"CANCEL_TPSL".equals(operation))
                    ||minimumSlot==null||minimumSlot.signum()<0||minimumSlot.bitLength()>64||"INCREASE".equals(operation)&&minimumSlot.signum()!=0)
                throw new IllegalArgumentException("Invalid perps journal identity");
            if("CANCEL_TPSL".equals(operation)){
                if(minimumSlot.signum()<=0||counter==null||counter.signum()<0||counter.bitLength()>64||request==null
                        ||!request.equals(DevnetSolana.encode(NativePerpsAddresses.exitRequest(DevnetSolana.decode(position,32),counter))))throw new IllegalArgumentException("Invalid cancellation journal identity");
            }else if(request!=null||counter!=null)throw new IllegalArgumentException("Unexpected cancellation metadata");
            this.asset=asset;this.side=side;this.position=position;this.signedWireSha256=digest;this.operation=operation;this.minimumSlot=minimumSlot;
            requestAddress=request;requestCounter=counter;
        }
    }
    void beginPerpsCancellation(NativePerpsSignedEnvelope envelope,NativePerpsCancelIntent intent,BigInteger fee,BigInteger slot)throws Exception{
        if(network!=WalletNetwork.SOLANA_MAINNET||envelope==null||intent==null||!owner.solanaAddress.equals(envelope.payer)||!owner.solanaAddress.equals(intent.payer)
                ||fee==null||fee.signum()<=0||fee.compareTo(BigInteger.valueOf(1000000))>0)throw new IOException("Cancellation journal owner mismatch");
        byte[] hash=java.security.MessageDigest.getInstance("SHA-256").digest(envelope.bytes());StringBuilder digest=new StringBuilder();for(byte b:hash)digest.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
        Perps metadata=new Perps(intent.asset,intent.side,intent.positionAddress,digest.toString(),owner.solanaAddress,"CANCEL_TPSL",slot,intent.requestAddress,intent.counter);
        validate(envelope.transactionId,intent.requestAddress,BigInteger.ONE,fee);
        synchronized(LOCK){Record old=read();if(old!=null&&(old.pending()||old.transactionId.equals(envelope.transactionId)))throw new IOException("Unresolved or recorded transaction");
            write(new Record(envelope.transactionId,intent.requestAddress,BigInteger.ONE,fee,Phase.UNKNOWN,System.currentTimeMillis(),null,null,null,null,metadata));}
    }

    void beginPerpsClose(NativePerpsSignedEnvelope envelope,NativePerpsCloseIntent intent,BigInteger fee,BigInteger minimumSlot)throws Exception{
        if(network!=WalletNetwork.SOLANA_MAINNET||envelope==null||intent==null||!owner.solanaAddress.equals(envelope.payer)
                ||!owner.solanaAddress.equals(intent.payer)||fee==null||fee.signum()<=0||fee.compareTo(BigInteger.valueOf(1000000))>0
                ||minimumSlot==null||minimumSlot.signum()<=0||minimumSlot.bitLength()>64)throw new IOException("Close journal owner mismatch");
        byte[] hash=java.security.MessageDigest.getInstance("SHA-256").digest(envelope.bytes());StringBuilder digest=new StringBuilder();
        for(byte value:hash)digest.append(String.format(java.util.Locale.ROOT,"%02x",value&255));
        Perps metadata=new Perps(intent.asset,intent.side,intent.positionAddress,digest.toString(),owner.solanaAddress,"FULL_CLOSE",minimumSlot);
        validate(envelope.transactionId,intent.positionAddress,intent.sizeUsd,fee);
        synchronized(LOCK){Record previous=read();if(previous!=null&&(previous.pending()||previous.transactionId.equals(envelope.transactionId)))throw new IOException("Unresolved or recorded transaction");
            write(new Record(envelope.transactionId,intent.positionAddress,intent.sizeUsd,fee,Phase.UNKNOWN,System.currentTimeMillis(),null,null,null,null,metadata));}
    }

    /** Caller must finish native review/biometrics first. This records, but never sends. */
    void beginPerps(NativePerpsSignedEnvelope envelope,NativePerpsOrderIntent intent,BigInteger fee)throws Exception{
        if(network!=WalletNetwork.SOLANA_MAINNET||envelope==null||intent==null||!owner.solanaAddress.equals(envelope.payer)
                ||fee==null||fee.signum()<=0||fee.compareTo(BigInteger.valueOf(1000000))>0)
            throw new IOException("Perps journal owner mismatch");
        String position=DevnetSolana.encode(NativePerpsAddresses.position(owner.solanaAddress,intent.asset,intent.side));
        byte[] hash=java.security.MessageDigest.getInstance("SHA-256").digest(envelope.bytes());
        StringBuilder hex=new StringBuilder();for(byte value:hash)hex.append(String.format(java.util.Locale.ROOT,"%02x",value&255));
        Perps metadata=new Perps(intent.asset,intent.side,position,hex.toString(),owner.solanaAddress);
        validate(envelope.transactionId,position,intent.marginUsd,fee);
        synchronized(LOCK){
            Record previous=read();
            if(previous!=null&&(previous.pending()||previous.transactionId.equals(envelope.transactionId)))throw new IOException("Unresolved or recorded transaction");
            write(new Record(envelope.transactionId,position,intent.marginUsd,fee,Phase.UNKNOWN,System.currentTimeMillis(),null,null,null,null,metadata));
        }
    }

    void beginSwap(String transactionId,NativeSwapService.Preview preview) throws Exception {
        var intent=preview.candidate.preparation.intent;
        if(network!=WalletNetwork.SOLANA_MAINNET || !owner.solanaAddress.equals(intent.payer)) throw new IOException("Swap journal owner mismatch");
        BigInteger units=new BigInteger(intent.amount),fee=preview.simulation.fee;
        validate(transactionId,owner.solanaAddress,units,fee);
        synchronized(LOCK) {
            Record previous=read();
            if(previous!=null && (previous.pending() || previous.transactionId.equals(transactionId))) throw new IOException("Unresolved or recorded transaction");
            write(new Record(transactionId,owner.solanaAddress,units,fee,Phase.UNKNOWN,System.currentTimeMillis(),intent.inputMint,intent.outputMint,preview.candidate.preparation.minimumOut));
        }
    }

    public Record latest() throws Exception { synchronized (LOCK) { return read(); } }
    void beginToken(String transactionId,String recipient,BigInteger units,BigInteger maximumFee,String mint) throws Exception {
        if(network!=WalletNetwork.SOLANA_MAINNET||!NativeSolanaTokens.USDC.equals(mint))throw new IOException("Unsupported token journal");
        validate(transactionId,recipient,units,maximumFee);
        synchronized(LOCK){
            Record previous=read();
            if(previous!=null&&(previous.pending()||previous.transactionId.equals(transactionId)))throw new IOException("Unresolved or recorded transaction");
            write(new Record(transactionId,recipient,units,maximumFee,Phase.UNKNOWN,System.currentTimeMillis(),null,null,null,mint));
        }
    }
    public void requireNoPending() throws Exception {
        synchronized (LOCK) { Record record = read(); if (record != null && record.pending()) throw new IOException("Check pending transaction before preparing another"); }
    }

    /** Must complete and verify on disk before the first broadcast attempt. */
    public void begin(String transactionId, String recipient, BigInteger units, BigInteger maximumFee) throws Exception {
        validate(transactionId, recipient, units, maximumFee);
        synchronized (LOCK) {
            Record previous = read();
            if (previous != null && (previous.pending() || previous.transactionId.equals(transactionId)))
                throw new IOException("Unresolved or previously recorded transaction; no resend");
            write(new Record(transactionId, recipient, units, maximumFee, Phase.UNKNOWN, System.currentTimeMillis()));
        }
    }

    // Native chain services call these only after matching the expected transaction identity.
    void submitted(String transactionId) throws Exception { transition(transactionId, Phase.SUBMITTED); }
    void settled(String transactionId, boolean success) throws Exception { transition(transactionId, success ? Phase.CONFIRMED : Phase.FAILED); }

    private void transition(String transactionId, Phase next) throws Exception {
        synchronized (LOCK) {
            Record previous = read();
            if (previous == null || !previous.transactionId.equals(transactionId)) throw new IOException("Transaction identity mismatch");
            if (previous.phase == next) return;
            if (!previous.pending()) throw new IOException("Final transaction state cannot be replaced");
            write(new Record(previous.transactionId, previous.recipient, previous.units, previous.maximumFee, next, previous.createdAt,previous.inputMint,previous.outputMint,previous.minimumOutput,previous.tokenMint,previous.perps));
        }
    }

    private void validate(String transactionId, String recipient, BigInteger units, BigInteger fee) {
        if (network == WalletNetwork.SOLANA_MAINNET) {
            DevnetSolana.decode(transactionId, 64); DevnetSolana.decode(recipient, 32);
        } else {
            if (transactionId == null || !transactionId.matches("0x[0-9a-f]{64}"))
                throw new IllegalArgumentException("Invalid EVM transaction identity");
            NativeEvmAddress.recipient(recipient);
        }
        int bits = network == WalletNetwork.SOLANA_MAINNET ? 64 : 256;
        if (units == null || fee == null || units.signum() <= 0 || fee.signum() < 0 ||
            units.bitLength() > bits || fee.bitLength() > bits) throw new IllegalArgumentException("Invalid transaction amounts");
    }

    private Record read() throws Exception {
        byte[] bytes;
        try (FileInputStream input = file.openRead()) { bytes = DevnetWalletService.readBounded(input, 4096); }
        catch (FileNotFoundException absent) {
            if (file.getBaseFile().exists() || new File(file.getBaseFile() + ".bak").exists() || new File(file.getBaseFile() + ".new").exists())
                throw new IOException("Transaction storage requires recovery", absent);
            return null;
        }
        JSONObject value = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        if (!Integer.valueOf(1).equals(value.get("version")) || !owner.ownerId.equals(value.getString("ownerId")) ||
            !network.storageDomain.equals(value.getString("network")) || !owner.address(network).equals(value.getString("from")))
            throw new IOException("Transaction owner or network mismatch");
        String amount = value.getString("units"), fee = value.getString("maximumFee");
        if (!amount.matches("[1-9][0-9]{0,77}") || !fee.matches("0|[1-9][0-9]{0,77}")) throw new IOException("Malformed transaction amounts");
        Object timestamp = value.get("createdAt");
        if (!(timestamp instanceof Long || timestamp instanceof Integer) || ((Number) timestamp).longValue() <= 0)
            throw new IOException("Invalid transaction timestamp");
        String inputMint=null,outputMint=null; BigInteger minimumOutput=null;
        if(value.has("swap")) {
            if(network!=WalletNetwork.SOLANA_MAINNET) throw new IOException("Invalid swap network");
            JSONObject swap=value.getJSONObject("swap"); inputMint=swap.getString("inputMint"); outputMint=swap.getString("outputMint");
            DevnetSolana.decode(inputMint,32); DevnetSolana.decode(outputMint,32);
            String minimum=swap.getString("minimumOutput");
            if(inputMint.equals(outputMint) || !minimum.matches("[1-9][0-9]{0,19}")) throw new IOException("Invalid swap metadata");
            minimumOutput=new BigInteger(minimum); if(minimumOutput.bitLength()>64) throw new IOException("Invalid swap minimum");
            if(!owner.solanaAddress.equals(value.getString("recipient"))) throw new IOException("Invalid swap recipient");
        }
        String tokenMint=value.has("tokenMint")?value.getString("tokenMint"):null;
        if(tokenMint!=null&&(network!=WalletNetwork.SOLANA_MAINNET||!NativeSolanaTokens.USDC.equals(tokenMint)||value.has("swap")))throw new IOException("Invalid transfer token");
        Perps perps=null;
        if(value.has("perps")){
            if(network!=WalletNetwork.SOLANA_MAINNET||value.has("swap")||tokenMint!=null)throw new IOException("Invalid perps journal network or kind");
            JSONObject p=value.getJSONObject("perps");Object side=p.get("side");
            if(!(side instanceof Integer)||p.length()!=4+(p.has("operation")?1:0)+(p.has("minimumSlot")?1:0)+(p.has("request")?1:0)+(p.has("counter")?1:0)||p.has("minimumSlot")&&!p.has("operation"))throw new IOException("Invalid perps journal metadata");
            String slot=p.has("minimumSlot")?p.getString("minimumSlot"):"0";if(!slot.matches("0|[1-9][0-9]{0,19}"))throw new IOException("Invalid perps journal bank");
            String counter=p.has("counter")?p.getString("counter"):null;if(counter!=null&&!counter.matches("0|[1-9][0-9]{0,19}"))throw new IOException("Invalid cancellation counter");
            perps=new Perps(p.getString("asset"),(Integer)side,p.getString("position"),p.getString("signedWireSha256"),owner.solanaAddress,p.has("operation")?p.getString("operation"):"INCREASE",new BigInteger(slot),p.has("request")?p.getString("request"):null,counter==null?null:new BigInteger(counter));
            if(!("CANCEL_TPSL".equals(perps.operation)?perps.requestAddress:perps.position).equals(value.getString("recipient")))throw new IOException("Invalid perps journal destination");
            if("CANCEL_TPSL".equals(perps.operation)&&(!"1".equals(amount)||new BigInteger(fee).compareTo(BigInteger.valueOf(1000000))>0))throw new IOException("Invalid cancellation count or fee");
        }
        Record record = new Record(value.getString("transactionId"), value.getString("recipient"), new BigInteger(amount),
            new BigInteger(fee), Phase.valueOf(value.getString("phase")), ((Number) timestamp).longValue(),inputMint,outputMint,minimumOutput,tokenMint,perps);
        validate(record.transactionId, record.recipient, record.units, record.maximumFee);
        return record;
    }

    private void write(Record record) throws Exception {
        JSONObject value = new JSONObject().put("version", 1).put("ownerId", owner.ownerId).put("network", network.storageDomain)
            .put("from", owner.address(network)).put("transactionId", record.transactionId).put("recipient", record.recipient)
            .put("units", record.units.toString()).put("maximumFee", record.maximumFee.toString())
            .put("phase", record.phase.name()).put("createdAt", record.createdAt);
        if(record.inputMint!=null) value.put("swap",new JSONObject().put("inputMint",record.inputMint).put("outputMint",record.outputMint).put("minimumOutput",record.minimumOutput.toString()));
        if(record.tokenMint!=null)value.put("tokenMint",record.tokenMint);
        if(record.perps!=null)value.put("perps",new JSONObject().put("asset",record.perps.asset).put("side",record.perps.side)
            .put("position",record.perps.position).put("signedWireSha256",record.perps.signedWireSha256));
        if(record.perps!=null&&!"INCREASE".equals(record.perps.operation))value.getJSONObject("perps").put("operation",record.perps.operation).put("minimumSlot",record.perps.minimumSlot.toString());
        if(record.perps!=null&&"CANCEL_TPSL".equals(record.perps.operation))value.getJSONObject("perps").put("request",record.perps.requestAddress).put("counter",record.perps.requestCounter.toString());
        byte[] expected = value.toString().getBytes(StandardCharsets.UTF_8);
        FileOutputStream output = null;
        try {
            output = file.startWrite(); output.write(expected); output.getFD().sync(); file.finishWrite(output); output = null;
            try (FileInputStream input = file.openRead()) {
                if (!Arrays.equals(expected, DevnetWalletService.readBounded(input, 4096))) throw new IOException("Transaction was not durably recorded");
            }
            WalletStorageBarrier.syncParents(file.getBaseFile(),privateRoot);
        } catch (Exception failure) { if (output != null) file.failWrite(output); throw failure; }
    }
}
