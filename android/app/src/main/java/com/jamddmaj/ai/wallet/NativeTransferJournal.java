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
        private final long createdAt;
        private Record(String transactionId, String recipient, BigInteger units, BigInteger maximumFee, Phase phase, long createdAt) {
            this(transactionId,recipient,units,maximumFee,phase,createdAt,null,null,null);
        }
        private Record(String transactionId,String recipient,BigInteger units,BigInteger maximumFee,Phase phase,long createdAt,String inputMint,String outputMint,BigInteger minimumOutput) {
            this.transactionId = transactionId; this.recipient = recipient; this.units = units;
            this.maximumFee = maximumFee; this.phase = phase; this.createdAt = createdAt;
            this.inputMint=inputMint; this.outputMint=outputMint; this.minimumOutput=minimumOutput;
        }
        public boolean pending() { return phase == Phase.UNKNOWN || phase == Phase.SUBMITTED; }
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
            write(new Record(previous.transactionId, previous.recipient, previous.units, previous.maximumFee, next, previous.createdAt,previous.inputMint,previous.outputMint,previous.minimumOutput));
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
        Record record = new Record(value.getString("transactionId"), value.getString("recipient"), new BigInteger(amount),
            new BigInteger(fee), Phase.valueOf(value.getString("phase")), ((Number) timestamp).longValue(),inputMint,outputMint,minimumOutput);
        validate(record.transactionId, record.recipient, record.units, record.maximumFee);
        return record;
    }

    private void write(Record record) throws Exception {
        JSONObject value = new JSONObject().put("version", 1).put("ownerId", owner.ownerId).put("network", network.storageDomain)
            .put("from", owner.address(network)).put("transactionId", record.transactionId).put("recipient", record.recipient)
            .put("units", record.units.toString()).put("maximumFee", record.maximumFee.toString())
            .put("phase", record.phase.name()).put("createdAt", record.createdAt);
        if(record.inputMint!=null) value.put("swap",new JSONObject().put("inputMint",record.inputMint).put("outputMint",record.outputMint).put("minimumOutput",record.minimumOutput.toString()));
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
