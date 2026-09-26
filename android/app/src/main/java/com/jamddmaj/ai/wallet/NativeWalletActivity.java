package com.jamddmaj.ai.wallet;

import android.app.Activity;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Bundle;
import android.os.Build;
import android.os.CancellationSignal;
import android.view.WindowManager;
import android.widget.*;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native-only account view. Not connected to the production launcher until enrollment/send QA is complete. */
public final class NativeWalletActivity extends Activity {
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private volatile long epoch;
    private HardwareWalletVault vault;
    private CancellationSignal cancellation;
    private TextView status,addresses;
    private LinearLayout accounts;
    private boolean es;
    private String text(String spanish,String english){return es?spanish:english;}
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        es=Locale.getDefault().getLanguage().equals("es");
        ScrollView scroll=new ScrollView(this);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
        int padding=(int)(20*getResources().getDisplayMetrics().density);root.setPadding(padding,padding,padding,padding);scroll.addView(root);setContentView(scroll);
        label(root,"JamdDmaj · Wallet",24);
        label(root,text("Billetera propia · separada de Bitget y del simulador.","Own wallet · separate from Bitget and simulation."),16);
        label(root,text("Integración en verificación. No deposites hasta que el envío y la recuperación estén habilitados y comprobados.","Integration under verification. Do not deposit until sending and recovery are enabled and verified."),16);
        accounts=new LinearLayout(this);accounts.setOrientation(LinearLayout.VERTICAL);root.addView(accounts);
        addresses=label(root,"",17);addresses.setTextIsSelectable(true);
        status=label(root,"",16);
        Button lock=new Button(this);lock.setText(text("Bloquear","Lock"));root.addView(lock);lock.setOnClickListener(v->lock());
    }
    private TextView label(LinearLayout root,String value,int size){TextView view=new TextView(this);view.setText(value);view.setTextSize(size);root.addView(view);return view;}
    @Override protected void onResume(){super.onResume();loadProfiles();}
    private void loadProfiles(){
        long ticket=epoch;
        worker.execute(()->{try{
            var profiles=new NativeWalletProfiles(this).list();
            runOnUiThread(()->{if(ticket!=epoch)return;accounts.removeAllViews();
                if(profiles.isEmpty())status.setText(text("Aún no hay una billetera recuperada en este dispositivo.","No recovered wallet on this device yet."));
                for(var profile:profiles){Button button=new Button(this);button.setText(profile.name+" · "+text("Desbloquear","Unlock"));accounts.addView(button);button.setOnClickListener(v->unlock(profile.ownerId));}
            });
        }catch(Exception failure){error(ticket);}});
    }
    private void unlock(String ownerId){
        lock();final long ticket=epoch;
        if(Build.VERSION.SDK_INT<30){error(ticket);return;}
        BiometricManager manager=getSystemService(BiometricManager.class);
        if(manager==null||manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)!=BiometricManager.BIOMETRIC_SUCCESS){
            status.setText(text("Configura una huella segura para abrir la billetera.","Configure strong biometrics to open the wallet."));return;
        }
        worker.execute(()->{try{
            NativeWalletProfiles.Profile profile=new NativeWalletProfiles(this).require(ownerId);
            HardwareWalletVault selected=new HardwareWalletVault(this,profile.ownerId,profile.vaultId);
            var operation=selected.prepareOpen();
            runOnUiThread(()->{if(ticket!=epoch){selected.cancel();return;}vault=selected;cancellation=new CancellationSignal();
                new BiometricPrompt.Builder(this).setTitle("JamdDmaj Wallet")
                    .setSubtitle(text("Verificar acceso a esta billetera","Verify access to this wallet"))
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .setNegativeButton(text("Cancelar","Cancel"),getMainExecutor(),(dialog,which)->lock()).build()
                    .authenticate(new BiometricPrompt.CryptoObject(operation.authenticationCipher()),cancellation,getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
                        @Override public void onAuthenticationError(int code,CharSequence message){if(ticket==epoch)lock();}
                        @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result){
                            if(ticket!=epoch)return;
                            if(result.getCryptoObject()==null||result.getCryptoObject().getCipher()!=operation.authenticationCipher()){error(ticket);return;}
                            worker.execute(()->{try{
                                if(ticket!=epoch)return;
                                operation.completeOpen(entropy->{
                                    NativeHdWallet.Addresses verified=NativeHdWallet.addresses(entropy);
                                    if(!profile.solanaAddress.equals(verified.solana)||!profile.bnbAddress.equalsIgnoreCase(verified.bnb))throw new SecurityException("Wallet metadata mismatch");
                                });
                                runOnUiThread(()->{if(ticket==epoch){addresses.setText("Solana mainnet · SOL\n"+profile.solanaAddress+"\n\nBNB Smart Chain · BNB\n"+profile.bnbAddress);status.setText(text("Consultando saldos…","Checking balances…"));}});
                                readBalances(profile,ticket);
                            }catch(Exception failure){error(ticket);}});
                        }
                    });
            });
        }catch(Exception failure){error(ticket);}});
    }
    private void readBalances(NativeWalletProfiles.Profile profile,long ticket){
        StringBuilder result=new StringBuilder();NativeWalletBalances reader=new NativeWalletBalances();
        for(WalletNetwork network:new WalletNetwork[]{WalletNetwork.SOLANA_MAINNET,WalletNetwork.BNB_MAINNET}){
            if(ticket!=epoch)return;
            String coin=network==WalletNetwork.SOLANA_MAINNET?"SOL":"BNB";
            try{var balance=reader.read(network,profile.address(network));result.append(coin).append(": ").append(balance.decimalAmount()).append("\n");}
            catch(Exception failure){result.append(coin).append(text(": saldo no disponible\n",": balance unavailable\n"));}
        }
        result.append(text("Consulta puntual; no se han enviado fondos.","Point-in-time lookup; no funds were sent."));
        runOnUiThread(()->{if(ticket==epoch)status.setText(result.toString());});
    }
    private void error(long ticket){runOnUiThread(()->{if(ticket!=epoch)return;lock();status.setText(text("No se pudo verificar. Recupera el respaldo si cambiaste la huella; no se ha enviado dinero.","Verification failed. Recover your backup if biometrics changed; no money was sent."));});}
    private void lock(){epoch++;if(cancellation!=null)cancellation.cancel();cancellation=null;if(vault!=null)vault.cancel();vault=null;if(addresses!=null)addresses.setText("");if(status!=null)status.setText(text("Billetera bloqueada.","Wallet locked."));}
    @Override protected void onStop(){lock();super.onStop();}
    @Override protected void onDestroy(){lock();worker.shutdownNow();super.onDestroy();}
}
