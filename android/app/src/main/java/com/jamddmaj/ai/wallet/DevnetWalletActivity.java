package com.jamddmaj.ai.wallet;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native devnet-only test wallet; no WebView and no mainnet endpoint. */
public final class DevnetWalletActivity extends Activity {
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final ArrayList<Button> controls=new ArrayList<>();
    private volatile long epoch=0;
    private DevnetWalletService service;
    private HardwareTestVault vault;
    private CancellationSignal signal;
    private EditText password,repeat,recipient,amount;
    private TextView status,identity;
    private byte[] exportBytes,importBytes,pendingSeed;
    private boolean es;
    private String text(String a,String b){return es?a:b;}
    private void message(String a,String b){status.setText(text(a,b));}

    @Override public void onCreate(Bundle state){
        super.onCreate(state);getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        es=Locale.getDefault().getLanguage().equals("es");service=new DevnetWalletService(this);
        ScrollView scroll=new ScrollView(this);LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);int pad=(int)(20*getResources().getDisplayMetrics().density);layout.setPadding(pad,pad,pad,pad);scroll.addView(layout);
        label(layout,"JamdDmaj · SOL DEVNET",24);
        label(layout,text("SOLO PRUEBAS. No deposites dinero real. Usa únicamente SOL de la red devnet. Esta billetera es independiente de Bitget; Wallet Lab y JamdDmaj guardan datos por separado.","TEST ONLY. Do not deposit real money. Use only SOL from devnet. This wallet is independent of Bitget; Wallet Lab and JamdDmaj store data separately."),16);
        identity=label(layout,text("Sin billetera recuperada.","No recovered wallet."),16);identity.setTextIsSelectable(true);
        label(layout,text("Contraseña del respaldo (mínimo 16 caracteres)","Backup passphrase (at least 16 characters)"),16);
        password=field(layout,true);label(layout,text("Repetir contraseña al crear una copia","Repeat passphrase when creating a backup"),16);repeat=field(layout,true);
        button(layout,text("1. Crear y guardar respaldo de prueba","1. Create and save test backup"),v->createBackup());
        button(layout,text("2. Abrir respaldo guardado","2. Open saved backup"),v->openBackup());
        button(layout,text("3. Recuperar y proteger con huella","3. Recover and protect with biometrics"),v->recover());
        button(layout,text("Consultar saldo SOL devnet","Check SOL devnet balance"),v->balance());
        label(layout,text("Destinatario SOL devnet","SOL devnet recipient"),16);recipient=field(layout,false);
        label(layout,text("Cantidad SOL de prueba (máximo 0.1)","Test SOL amount (maximum 0.1)"),16);amount=field(layout,false);amount.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);
        button(layout,text("Revisar envío de prueba","Review test transfer"),v->prepare());
        button(layout,text("Comprobar último envío","Check latest transfer"),v->checkStatus());
        Button cancel=new Button(this);cancel.setText(text("Cancelar y bloquear","Cancel and lock"));layout.addView(cancel);cancel.setOnClickListener(v->{lock();message("Bloqueado. Un envío ya transmitido debe comprobarse; no se cancela desde aquí.","Locked. A transaction already broadcast must be checked; it is not cancelled here.");});
        status=label(layout,"",16);setContentView(scroll);
        if(Build.VERSION.SDK_INT<30){busy(true);message("Requiere Android 11 o posterior.","Requires Android 11 or later.");}else refreshIdentity();
    }
    private TextView label(LinearLayout layout,String value,int size){TextView n=new TextView(this);n.setText(value);n.setTextSize(size);n.setPadding(0,10,0,10);layout.addView(n);return n;}
    private EditText field(LinearLayout layout,boolean secret){EditText n=new EditText(this);n.setSingleLine(true);n.setSaveEnabled(false);if(Build.VERSION.SDK_INT>=26)n.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);n.setInputType(secret?InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD:InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);layout.addView(n);return n;}
    private void button(LinearLayout layout,String title,View.OnClickListener action){Button n=new Button(this);n.setText(title);n.setOnClickListener(action);layout.addView(n);controls.add(n);}
    private void busy(boolean value){for(Button n:controls)n.setEnabled(!value&&Build.VERSION.SDK_INT>=30);}
    private char[] takePassword(){char[] value=password.getText().toString().toCharArray();password.setText("");return value;}
    private synchronized void lock(){epoch++;CancellationSignal old=signal;signal=null;if(old!=null)old.cancel();if(vault!=null)vault.cancel();if(pendingSeed!=null){Arrays.fill(pendingSeed,(byte)0);pendingSeed=null;}if(password!=null)password.setText("");if(repeat!=null)repeat.setText("");busy(false);}
    private void fail(long ticket){runOnUiThread(()->{if(ticket!=epoch)return;lock();message("No se completó. Comprueba contraseña, huella, saldo y red devnet. Si intentaste enviar, comprueba el último envío antes de repetir. No se reemplazó una billetera existente.","Not completed. Check passphrase, biometrics, balance and devnet. If you attempted a transfer, check the latest transfer before retrying. No existing wallet was replaced.");});}
    private void refreshIdentity(){long ticket=epoch;worker.execute(()->{try{JSONObject info=service.wallet();runOnUiThread(()->{if(ticket==epoch&&info!=null)identity.setText("SOL DEVNET · "+text("NO DINERO REAL","NO REAL FUNDS")+"\n"+info.optString("address"));});}catch(Exception failure){fail(ticket);}});}
    private void createBackup(){
        char[] pass=takePassword(),confirmation=repeat.getText().toString().toCharArray();repeat.setText("");
        if(pass.length<16||pass.length>1024||!Arrays.equals(pass,confirmation)){Arrays.fill(pass,'\0');Arrays.fill(confirmation,'\0');message("Usa una contraseña de 16 caracteres o más y repítela exactamente.","Use a passphrase of at least 16 characters and repeat it exactly.");return;}Arrays.fill(confirmation,'\0');
        lock();busy(true);long ticket=epoch;worker.execute(()->{byte[] seed=new byte[32];try{
            if(service.wallet()!=null)throw new IllegalStateException("Wallet exists");new SecureRandom().nextBytes(seed);byte[] encrypted=PortableTestBackup.seal(seed,pass);
            runOnUiThread(()->{if(ticket!=epoch)return;exportBytes=encrypted;Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE,"jamddmaj-DEVNET-backup.jdev");startActivityForResult(intent,101);});
        }catch(Exception failure){fail(ticket);}finally{Arrays.fill(seed,(byte)0);Arrays.fill(pass,'\0');}});
    }
    private void openBackup(){lock();startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"),102);}
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);if(request!=101&&request!=102)return;if(result!=RESULT_OK||data==null||data.getData()==null){exportBytes=null;busy(false);message("Selección cancelada.","Selection cancelled.");return;}
        Uri uri=data.getData();long ticket=epoch;busy(true);
        if(request==101){byte[] payload=exportBytes;exportBytes=null;worker.execute(()->{try{if(payload==null)throw new IllegalStateException("Backup unavailable; recreate");try(OutputStream out=getContentResolver().openOutputStream(uri,"w")){if(out==null)throw new java.io.IOException();out.write(payload);out.flush();}
            runOnUiThread(()->{if(ticket!=epoch)return;busy(false);message("Respaldo cifrado guardado. Ábrelo en el paso 2, introduce de nuevo su contraseña y recupera en el paso 3. No lo compartas junto con su contraseña.","Encrypted backup saved. Open it in step 2, enter its passphrase again and recover in step 3. Never share it together with its passphrase.");});
        }catch(Exception failure){fail(ticket);}});}
        else if(request==102)worker.execute(()->{try{byte[] bytes;try(InputStream input=getContentResolver().openInputStream(uri)){bytes=DevnetWalletService.readBounded(input,PortableTestBackup.SIZE);}if(bytes.length!=PortableTestBackup.SIZE)throw new java.io.IOException("Invalid backup");runOnUiThread(()->{if(ticket!=epoch)return;importBytes=bytes;busy(false);message("Archivo abierto. Escribe la contraseña y pulsa recuperar. Nunca se solicita tu frase de una billetera real.","File opened. Enter the passphrase and choose recover. We never request your real wallet recovery phrase.");});}catch(Exception failure){fail(ticket);}});
    }
    private boolean biometrics(){if(Build.VERSION.SDK_INT<30)return false;BiometricManager manager=getSystemService(BiometricManager.class);return manager!=null&&manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)==BiometricManager.BIOMETRIC_SUCCESS;}
    private interface Authorized {void run(HardwareTestVault.Operation operation)throws Exception;}
    private void authenticate(HardwareTestVault.Operation operation,String subtitle,long ticket,Authorized action){
        signal=new CancellationSignal();new BiometricPrompt.Builder(this).setTitle("JamdDmaj · DEVNET").setSubtitle(subtitle).setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setNegativeButton(text("Cancelar","Cancel"),getMainExecutor(),(dialog,which)->{lock();message("Cancelado y bloqueado.","Cancelled and locked.");}).build()
            .authenticate(new BiometricPrompt.CryptoObject(operation.authenticationCipher()),signal,getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
                @Override public void onAuthenticationError(int code,CharSequence reason){if(ticket==epoch){lock();message("Autenticación cancelada o no disponible.","Authentication cancelled or unavailable.");}}
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result){if(ticket!=epoch)return;if(result.getCryptoObject()==null||result.getCryptoObject().getCipher()!=operation.authenticationCipher()){fail(ticket);return;}worker.execute(()->{try{if(ticket!=epoch)return;action.run(operation);}catch(Exception failure){fail(ticket);}});}
            });
    }
    private void recover(){
        if(importBytes==null||!biometrics()){message("Abre un respaldo y configura biometría fuerte en tu teléfono.","Open a backup and configure strong biometrics on your phone.");return;}
        char[] pass=takePassword();byte[] encrypted=importBytes.clone();lock();busy(true);long ticket=epoch;
        worker.execute(()->{byte[] seed=null;try{if(service.wallet()!=null)throw new IllegalStateException("Wallet already exists");seed=PortableTestBackup.open(encrypted,pass);String publicAddress=DevnetSolana.address(seed),id=UUID.randomUUID().toString().replace("-","");
            HardwareTestVault target=new HardwareTestVault(this,id);HardwareTestVault.Operation operation=target.prepareCreate();byte[] recovered=seed;seed=null;
            runOnUiThread(()->{if(ticket!=epoch){Arrays.fill(recovered,(byte)0);target.cancel();return;}vault=target;pendingSeed=recovered;authenticate(operation,text("Proteger billetera de prueba recuperada","Protect recovered test wallet"),ticket,op->{
                byte[] local; synchronized(DevnetWalletActivity.this){if(ticket!=epoch||pendingSeed==null)throw new IllegalStateException("Locked");local=pendingSeed.clone();}
                try{op.completeCreate(local);service.saveRecoveredWallet(id,publicAddress);}finally{Arrays.fill(local,(byte)0);}
                runOnUiThread(()->{if(ticket!=epoch)return;lock();importBytes=null;identity.setText("SOL DEVNET · "+text("NO DINERO REAL","NO REAL FUNDS")+"\n"+publicAddress);message("Recuperación verificada y billetera de prueba protegida. Conserva el archivo y la contraseña por separado.","Recovery verified and test wallet protected. Keep backup file and passphrase separately.");});
            });});
        }catch(Exception failure){fail(ticket);}finally{if(seed!=null)Arrays.fill(seed,(byte)0);Arrays.fill(pass,'\0');}});
    }
    private void balance(){lock();busy(true);long ticket=epoch;worker.execute(()->{try{long value=service.balance();runOnUiThread(()->{if(ticket!=epoch)return;busy(false);status.setText(text("Saldo de prueba: ","Test balance: ")+java.math.BigDecimal.valueOf(value,9).toPlainString()+" SOL DEVNET");});}catch(Exception failure){fail(ticket);}});}
    private void prepare(){
        if(!biometrics()){message("Biometría fuerte no disponible.","Strong biometrics unavailable.");return;}
        String to=recipient.getText().toString().trim(),units=amount.getText().toString().trim();lock();busy(true);long ticket=epoch;
        worker.execute(()->{try{DevnetWalletService.Draft draft=service.prepare(to,units);JSONObject info=service.wallet();HardwareTestVault target=new HardwareTestVault(this,info.getString("id"));
            runOnUiThread(()->{if(ticket!=epoch)return;new AlertDialog.Builder(this).setTitle(text("Confirmar envío SOLO DEVNET","Confirm DEVNET-ONLY transfer"))
                .setMessage(text("Destino: ","Recipient: ")+draft.recipient+"\n"+draft.amount+" SOL DEVNET\n"+text("Comisión: ","Fee: ")+draft.fee+" lamports\n"+text("No es dinero real. Después debes comprobar la confirmación.","Not real money. Check network confirmation afterwards."))
                .setNegativeButton(text("Cancelar","Cancel"),(d,w)->lock()).setOnCancelListener(d->lock())
                .setPositiveButton(text("Confirmar con huella","Confirm with biometrics"),(d,w)->worker.execute(()->{try{if(ticket!=epoch)return;HardwareTestVault.Operation operation=target.prepareOpen();runOnUiThread(()->{if(ticket!=epoch){target.cancel();return;}vault=target;authenticate(operation,text("Autorizar solo este envío de prueba","Authorize only this test transfer"),ticket,op->{
                    final byte[][] signature=new byte[1][];op.completeOpen(seed->signature[0]=service.signReviewed(draft,seed));String hash=service.submit(draft,signature[0],()->ticket==epoch);
                    runOnUiThread(()->{if(ticket!=epoch)return;lock();status.setText(text("Enviado a devnet, todavía sin confirmación. Pulsa comprobar último envío.\n","Submitted to devnet, not yet confirmed. Choose check latest transfer.\n")+hash);});
                });});}catch(Exception failure){fail(ticket);}})).show();});
        }catch(Exception failure){fail(ticket);}});
    }
    private void checkStatus(){lock();busy(true);long ticket=epoch;worker.execute(()->{try{String result=service.status();runOnUiThread(()->{if(ticket!=epoch)return;busy(false);String[] parts=result.split("\n",2);String label;
            switch(parts[0]){case "confirmed":label=text("Confirmado en devnet.","Confirmed on devnet.");break;case "failed":label=text("La red confirmó un fallo.","Network confirmed a failure.");break;case "none":label=text("No hay envío registrado.","No recorded transfer.");break;default:label=text("Pendiente o incierto. No vuelvas a enviarlo.","Pending or uncertain. Do not send again.");}
            status.setText(label+(parts.length>1?"\n"+parts[1]:""));});}catch(Exception failure){fail(ticket);}});}
    @Override protected void onStop(){synchronized(this){lock();}if(status!=null)message("Bloqueado al salir. Comprueba cualquier envío pendiente antes de repetir.","Locked when leaving. Check any pending transfer before retrying.");super.onStop();}
    @Override protected void onDestroy(){lock();worker.shutdownNow();super.onDestroy();}
}
