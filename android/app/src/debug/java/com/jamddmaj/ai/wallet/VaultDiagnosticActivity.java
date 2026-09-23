package com.jamddmaj.ai.wallet;

import android.app.Activity;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Offline hardware diagnostic. Fixed disposable bytes only, no wallet or financial functionality. */
public final class VaultDiagnosticActivity extends Activity {
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private volatile long generation=0;
    private HardwareTestVault vault;
    private CancellationSignal cancellation;
    private TextView status;
    private Button create,verify;
    private boolean es;
    private String text(String a,String b){return es?a:b;}

    @Override public void onCreate(Bundle savedState){
        super.onCreate(savedState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        es=Locale.getDefault().getLanguage().equals("es");
        LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);
        int pad=(int)(20*getResources().getDisplayMetrics().density);layout.setPadding(pad,pad,pad,pad);
        TextView title=new TextView(this);title.setTextSize(24);title.setText(text("Diagnóstico de seguridad","Security diagnostic"));layout.addView(title);
        TextView note=new TextView(this);note.setText(text(
            "SIN FONDOS. Esta app separada prueba cifrado y huella con datos desechables. No crea billeteras, no recibe dinero y no se conecta a Internet. No sustituye una auditoría.",
            "NO FUNDS. This separate app tests encryption and biometrics using disposable data. It does not create wallets, receive money or connect to the Internet. This is not an audit."));layout.addView(note);
        create=button(layout,text("1. Crear dato de prueba protegido","1. Create protected test data"));
        verify=button(layout,text("2. Desbloquear y verificar","2. Unlock and verify"));
        Button cancel=button(layout,text("Cancelar y bloquear","Cancel and lock"));
        status=new TextView(this);status.setTextIsSelectable(false);layout.addView(status);setContentView(layout);
        create.setOnClickListener(v->start(true));verify.setOnClickListener(v->start(false));cancel.setOnClickListener(v->{lock();status.setText(text("Bloqueado.","Locked."));});
        if(Build.VERSION.SDK_INT<30){create.setEnabled(false);verify.setEnabled(false);status.setText(text("Esta prueba requiere Android 11 o posterior.","This test requires Android 11 or later."));}
        else status.setText(text("Necesitas biometría fuerte registrada. Si ya creaste el dato, usa verificar; nunca se sobrescribe.","Enrolled strong biometrics are required. If test data already exists, choose verify; it is never overwritten."));
    }
    private Button button(LinearLayout layout,String title){Button button=new Button(this);button.setText(title);layout.addView(button);return button;}
    private void busy(boolean value){create.setEnabled(!value&&Build.VERSION.SDK_INT>=30);verify.setEnabled(!value&&Build.VERSION.SDK_INT>=30);}
    private void start(boolean writing){
        if(Build.VERSION.SDK_INT<30)return;
        BiometricManager manager=getSystemService(BiometricManager.class);
        if(manager==null||manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)!=BiometricManager.BIOMETRIC_SUCCESS){
            status.setText(text("Biometría fuerte no disponible. Configúrala en los ajustes del teléfono; no hay alternativa menos segura en esta prueba.","Strong biometrics unavailable. Set them up in phone settings; this test does not use a weaker fallback."));return;
        }
        lock();final long ticket=generation;busy(true);status.setText(text("Preparando prueba…","Preparing test…"));
        worker.execute(()->{
            try{
                if(vault==null)vault=new HardwareTestVault(this,"11111111111111111111111111111111");
                HardwareTestVault.Operation operation=writing?vault.prepareCreate():vault.prepareOpen();
                runOnUiThread(()->{if(ticket!=generation){vault.cancel();return;}authenticate(operation,writing,ticket);});
            }catch(Exception failure){fail(ticket);}
        });
    }
    private void authenticate(HardwareTestVault.Operation operation,boolean writing,long ticket){
        cancellation=new CancellationSignal();
        BiometricPrompt prompt=new BiometricPrompt.Builder(this)
            .setTitle(text("JamdDmaj · prueba sin fondos","JamdDmaj · no-funds test"))
            .setSubtitle(writing?text("Proteger dato desechable","Protect disposable data"):text("Verificar dato desechable","Verify disposable data"))
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setNegativeButton(text("Cancelar","Cancel"),getMainExecutor(),(dialog,which)->{lock();status.setText(text("Cancelado; bloqueado.","Cancelled; locked."));}).build();
        prompt.authenticate(new BiometricPrompt.CryptoObject(operation.authenticationCipher()),cancellation,getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
            @Override public void onAuthenticationError(int code,CharSequence message){if(ticket==generation){lock();status.setText(text("Autenticación cancelada o no disponible. No se completó la operación.","Authentication cancelled or unavailable. Operation was not completed."));}}
            @Override public void onAuthenticationFailed(){if(ticket==generation)status.setText(text("Huella no reconocida. Reintenta o cancela.","Biometric not recognized. Retry or cancel."));}
            @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result){
                if(ticket!=generation)return;
                if(result.getCryptoObject()==null||result.getCryptoObject().getCipher()!=operation.authenticationCipher()){fail(ticket);return;}
                worker.execute(()->{
                    try{
                        if(ticket!=generation)return;
                        if(writing){byte[] disposable=new byte[32];Arrays.fill(disposable,(byte)0x5a);try{operation.completeCreate(disposable);}finally{Arrays.fill(disposable,(byte)0);}}
                        else operation.completeOpen(bytes->{for(byte value:bytes)if(value!=(byte)0x5a)throw new SecurityException("Test mismatch");});
                        runOnUiThread(()->{if(ticket!=generation)return;lock();status.setText(writing?text("Dato de prueba cifrado. Pulsa verificar para comprobar su recuperación.","Test data encrypted. Choose verify to check recovery."):text("Verificación correcta. Datos temporales borrados y almacén bloqueado. Aún no es una billetera.","Verification passed. Temporary data cleared and vault locked. This is not yet a wallet."));});
                    }catch(Exception failure){fail(ticket);}
                });
            }
        });
    }
    private void fail(long ticket){runOnUiThread(()->{if(ticket!=generation)return;lock();status.setText(text("Prueba no completada: el dato puede existir, faltar o estar invalidado, o el teléfono no ofrece la protección requerida. No se reemplazaron claves ni datos existentes.","Test not completed: data may exist, be missing or invalidated, or the device may lack required protection. Existing keys and data were not replaced."));});}
    private void lock(){generation++;CancellationSignal signal=cancellation;cancellation=null;if(signal!=null)signal.cancel();if(vault!=null)vault.cancel();busy(false);}
    @Override protected void onStop(){lock();if(status!=null)status.setText(text("Bloqueado al salir de la app.","Locked when leaving the app."));super.onStop();}
    @Override protected void onDestroy(){lock();worker.shutdownNow();super.onDestroy();}
}
