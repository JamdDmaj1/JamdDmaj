package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import org.json.JSONArray;

/** Public account selection only. Never unlocks a vault or grants signing access.
 * Atomic file reads avoid stale SharedPreferences across the isolated wallet process. */
public final class NativeWalletPublicSelection {
    private final Context context;
    private final AtomicFile file;
    public NativeWalletPublicSelection(Context context){
        this.context=context;file=new AtomicFile(new File(context.getNoBackupFilesDir(),"native-wallet-public-selection-v1.json"));
    }
    public NativeWalletProfiles.Profile selected()throws Exception{
        String owner=null;
        try(FileInputStream input=file.openRead()){
            JSONObject value=new JSONObject(new String(DevnetWalletService.readBounded(input,1024),StandardCharsets.UTF_8));
            if(value.getInt("version")!=1)throw new IOException("Unsupported public selection");owner=value.getString("owner");
        }catch(FileNotFoundException absent){
            if(file.getBaseFile().exists())throw absent;
        }
        NativeWalletProfiles profiles=new NativeWalletProfiles(context);
        if(owner!=null)return profiles.require(owner);
        // A sole recovered profile is unambiguous public display data, not an
        // authenticated session. Multiple profiles require a native selection.
        var known=profiles.list();return known.size()==1?known.get(0):null;
    }
    public void select(NativeWalletProfiles.Profile profile)throws Exception{
        if(profile==null)throw new IllegalArgumentException("Existing native profile required");
        NativeWalletProfiles.Profile saved=new NativeWalletProfiles(context).require(profile.ownerId);
        if(!saved.solanaAddress.equals(profile.solanaAddress))throw new IOException("Public account changed");
        byte[] data=new JSONObject().put("version",1).put("owner",saved.ownerId).toString().getBytes(StandardCharsets.UTF_8);
        FileOutputStream output=null;
        try{output=file.startWrite();output.write(data);output.getFD().sync();file.finishWrite(output);output=null;}
        finally{if(output!=null)file.failWrite(output);}
    }
    public JSONObject publicAccount()throws Exception{
        NativeWalletProfiles.Profile profile=selected();
        JSONObject value=new JSONObject().put("available",profile!=null);
        if(profile!=null){
            value.put("address",profile.solanaAddress).put("network","solana:mainnet").put("name",profile.name).put("source","native");
            // Read public transaction identity/phase only. Never expose a wire,
            // vault credential, recipient, recovery material or signing grant.
            try{
                NativeTransferJournal.Record record=new NativeTransferJournal(context,profile,WalletNetwork.SOLANA_MAINNET).latest();
                JSONArray pending=new JSONArray();
                if(record!=null&&record.pending())pending.put(new JSONObject().put("id",record.transactionId).put("state",record.phase.name()));
                value.put("pendingKnown",true).put("pending",pending);
            }catch(Exception unavailable){value.put("pendingKnown",false).put("pending",new JSONArray());}
        }
        return value;
    }
}
