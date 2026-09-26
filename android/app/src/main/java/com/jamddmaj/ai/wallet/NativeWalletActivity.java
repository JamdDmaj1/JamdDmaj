package com.jamddmaj.ai.wallet;

import android.app.Activity;
import android.app.AlertDialog;
import java.math.BigDecimal;
import android.content.Intent;
import android.text.InputType;
import android.view.View;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Arrays;
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
    private NativeWalletEnrollment enrollment;
    private EditText walletName,password,passwordRepeat;
    private byte[] exportBackup,openedBackup;
    private String recoveryOwner;
    private NativeWalletProfiles.Profile selectedProfile;
    private EditText recipient,sendAmount;
    private EditText bnbRecipient,bnbAmount;
    private String text(String spanish,String english){return es?spanish:english;}
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        es=Locale.getDefault().getLanguage().equals("es");
        enrollment=new NativeWalletEnrollment(this);
        ScrollView scroll=new ScrollView(this);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
        int padding=(int)(20*getResources().getDisplayMetrics().density);root.setPadding(padding,padding,padding,padding);scroll.addView(root);setContentView(scroll);
        label(root,"JamdDmaj · Wallet",24);
        label(root,text("Billetera propia · separada de Bitget y del simulador.","Own wallet · separate from Bitget and simulation."),16);
        label(root,text("Integración en verificación. No deposites hasta que el envío y la recuperación estén habilitados y comprobados.","Integration under verification. Do not deposit until sending and recovery are enabled and verified."),16);
        accounts=new LinearLayout(this);accounts.setOrientation(LinearLayout.VERTICAL);root.addView(accounts);
        addresses=label(root,"",17);addresses.setTextIsSelectable(true);
        status=label(root,"",16);
        walletName=field(root,text("Nombre de la billetera","Wallet name"),false);
        password=field(root,text("Contraseña del respaldo: mínimo 16 caracteres","Backup password: at least 16 characters"),true);
        passwordRepeat=field(root,text("Repite la contraseña al crear","Repeat password when creating"),true);
        action(root,text("1. Crear respaldo cifrado","1. Create encrypted backup"),()->createBackup());
        action(root,text("2. Abrir respaldo guardado","2. Open saved backup"),()->{
            lock();openedBackup=null;
            startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/octet-stream").addCategory(Intent.CATEGORY_OPENABLE),202);
        });
        action(root,text("3. Recuperar y proteger con huella","3. Recover and protect with biometrics"),()->recover());
        label(root,text("Envío manual · SOL en Solana mainnet","Manual transfer · SOL on Solana mainnet"),18);
        recipient=field(root,text("Dirección de destino Solana","Solana destination address"),false);
        sendAmount=field(root,text("Cantidad de SOL","SOL amount"),false);
        sendAmount.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);
        action(root,text("Revisar envío de SOL","Review SOL transfer"),()->reviewSolana());
        action(root,text("Consultar último envío de SOL","Check latest SOL transfer"),()->checkSolana());
        label(root,text("Envío manual · BNB Smart Chain","Manual transfer · BNB Smart Chain"),18);
        bnbRecipient=field(root,text("Dirección de destino BNB (0x…)","BNB destination address (0x…)"),false);
        bnbAmount=field(root,text("Cantidad de BNB","BNB amount"),false);
        bnbAmount.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);
        action(root,text("Revisar envío de BNB","Review BNB transfer"),()->reviewBnb());
        action(root,text("Consultar último envío de BNB","Check latest BNB transfer"),()->checkBnb());
        Button lock=new Button(this);lock.setText(text("Bloquear","Lock"));root.addView(lock);lock.setOnClickListener(v->lock());
    }
    private EditText field(LinearLayout root,String hint,boolean secret){
        EditText value=new EditText(this);value.setHint(hint);value.setSaveEnabled(false);
        value.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        value.setInputType(InputType.TYPE_CLASS_TEXT|(secret?InputType.TYPE_TEXT_VARIATION_PASSWORD:InputType.TYPE_TEXT_FLAG_CAP_SENTENCES));root.addView(value);return value;
    }
    private void action(LinearLayout root,String caption,Runnable action){Button button=new Button(this);button.setText(caption);root.addView(button);button.setOnClickListener(v->action.run());}
    private char[] take(EditText field){char[] chars=new char[field.length()];field.getText().getChars(0,chars.length,chars,0);field.setText("");return chars;}
    private void createBackup(){
        char[] pass=take(password),repeat=take(passwordRepeat);
        if(!Arrays.equals(pass,repeat)){Arrays.fill(pass,'\0');Arrays.fill(repeat,'\0');status.setText(text("Las contraseñas no coinciden.","Passwords do not match."));return;}
        Arrays.fill(repeat,'\0');lock();recoveryOwner=null;openedBackup=null;long ticket=epoch;
        worker.execute(()->{try{byte[] encrypted=NativeWalletEnrollment.createBackup(pass);
            runOnUiThread(()->{if(ticket!=epoch)return;exportBackup=encrypted;
                startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/octet-stream").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"JamdDmaj-wallet-backup.jamdhd"),201);
            });
        }catch(Exception failure){error(ticket);}finally{Arrays.fill(pass,'\0');}});
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request!=201&&request!=202)return;
        byte[] outgoing=exportBackup;exportBackup=null;
        if(result!=RESULT_OK||data==null||data.getData()==null){status.setText(text("Selección cancelada.","Selection cancelled."));return;}
        var uri=data.getData();long ticket=epoch;
        worker.execute(()->{try{
            if(request==201){
                if(outgoing==null)throw new IllegalStateException("Backup expired");
                try(OutputStream output=getContentResolver().openOutputStream(uri,"w")){if(output==null)throw new java.io.IOException();output.write(outgoing);output.flush();}
                runOnUiThread(()->{if(ticket==epoch)status.setText(text("Respaldo guardado. Ábrelo de nuevo e introduce su contraseña para comprobar que puedes recuperarlo.","Backup saved. Reopen it and enter its password to verify recovery."));});
            }else{
                byte[] encrypted;try(InputStream input=getContentResolver().openInputStream(uri)){if(input==null)throw new java.io.IOException();encrypted=DevnetWalletService.readBounded(input,PortableWalletBackup.SIZE);}
                if(encrypted.length!=PortableWalletBackup.SIZE)throw new IllegalArgumentException("Wrong backup format");
                runOnUiThread(()->{if(ticket==epoch){openedBackup=encrypted;status.setText(text("Introduce la contraseña y pulsa recuperar.","Enter the password and choose recover."));}});
            }
        }catch(Exception failure){error(ticket);}});
    }
    private void recover(){
        if(openedBackup==null||Build.VERSION.SDK_INT<30){status.setText(text("Abre un respaldo compatible primero. Requiere Android 11 o posterior.","Open a compatible backup first. Android 11 or later required."));return;}
        byte[] encrypted=openedBackup.clone();char[] pass=take(password);String name=walletName.getText().toString().trim(),owner=recoveryOwner;
        lock();long ticket=epoch;
        worker.execute(()->{try{
            NativeWalletEnrollment.Pending pending=enrollment.recover(encrypted,pass,name,owner);
            runOnUiThread(()->{if(ticket!=epoch){enrollment.cancel();return;}cancellation=new CancellationSignal();
                new BiometricPrompt.Builder(this).setTitle("JamdDmaj Wallet")
                    .setSubtitle(text("Proteger la billetera recuperada","Protect the recovered wallet"))
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .setNegativeButton(text("Cancelar","Cancel"),getMainExecutor(),(dialog,which)->lock()).build()
                    .authenticate(new BiometricPrompt.CryptoObject(pending.authenticationCipher()),cancellation,getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
                        @Override public void onAuthenticationError(int code,CharSequence message){if(ticket==epoch)lock();}
                        @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result){
                            if(ticket!=epoch)return;
                            worker.execute(()->{try{
                                if(ticket!=epoch)return;
                                if(result.getCryptoObject()==null)throw new SecurityException("No cipher");
                                pending.complete(result.getCryptoObject().getCipher());
                                runOnUiThread(()->{if(ticket!=epoch)return;openedBackup=null;recoveryOwner=null;loadProfiles();status.setText(text("Recuperación guardada. Desbloquea tu billetera para verificar sus direcciones.","Recovery saved. Unlock your wallet to verify its addresses."));});
                            }catch(Exception failure){error(ticket);}});
                        }
                    });
            });
        }catch(Exception failure){error(ticket);}finally{Arrays.fill(pass,'\0');Arrays.fill(encrypted,(byte)0);}});
    }
    private TextView label(LinearLayout root,String value,int size){TextView view=new TextView(this);view.setText(value);view.setTextSize(size);root.addView(view);return view;}
    @Override protected void onResume(){super.onResume();loadProfiles();}
    private void loadProfiles(){
        long ticket=epoch;
        worker.execute(()->{try{
            var profiles=new NativeWalletProfiles(this).list();
            runOnUiThread(()->{if(ticket!=epoch)return;accounts.removeAllViews();
                if(profiles.isEmpty())status.setText(text("Aún no hay una billetera recuperada en este dispositivo.","No recovered wallet on this device yet."));
                for(var profile:profiles){Button button=new Button(this);button.setText(profile.name+" · "+text("Desbloquear","Unlock"));accounts.addView(button);button.setOnClickListener(v->unlock(profile.ownerId));
                    action(accounts,profile.name+" · "+text("Recuperar acceso","Recover access"),()->{lock();recoveryOwner=profile.ownerId;walletName.setText(profile.name);status.setText(text("Abre el respaldo de esta billetera para recuperar su acceso.","Open this wallet's backup to recover its access."));});}
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
                                runOnUiThread(()->{if(ticket==epoch){selectedProfile=profile;addresses.setText("Solana mainnet · SOL\n"+profile.solanaAddress+"\n\nBNB Smart Chain · BNB\n"+profile.bnbAddress);status.setText(text("Consultando saldos…","Checking balances…"));}});
                                readBalances(profile,ticket);
                            }catch(Exception failure){error(ticket);}});
                        }
                    });
            });
        }catch(Exception failure){error(ticket);}});
    }
    private void reviewSolana(){
        NativeWalletProfiles.Profile profile=selectedProfile;
        if(profile==null){status.setText(text("Desbloquea primero la billetera.","Unlock the wallet first."));return;}
        String to=recipient.getText().toString().trim(),amount=sendAmount.getText().toString().trim();
        lock();selectedProfile=profile;long ticket=epoch;
        status.setText(text("Preparando revisión; todavía no se firma ni se envía.","Preparing review; nothing is signed or sent yet."));
        worker.execute(()->{try{
            SolanaNativeTransfers service=new SolanaNativeTransfers(this,profile);
            SolanaNativeTransfers.Draft draft=service.prepare(to,amount);
            runOnUiThread(()->{if(ticket!=epoch)return;
                String review="Solana MAINNET\n\n"+text("Desde: ","From: ")+draft.from+"\n\n"+text("Destino: ","To: ")+draft.recipient+
                    "\n\nSOL: "+new BigDecimal(draft.units,9).toPlainString()+"\n"+text("Comisión SOL: ","SOL fee: ")+new BigDecimal(draft.fee,9).toPlainString()+
                    "\n\n"+text("Dinero real. Comprueba la dirección completa. La siguiente huella autoriza este envío.","Real funds. Check the full address. The next biometric approval authorizes this transfer.");
                new AlertDialog.Builder(this).setTitle(text("Revisar antes de enviar","Review before sending")).setMessage(review)
                    .setNegativeButton(text("Cancelar","Cancel"),(dialog,which)->lock())
                    .setOnCancelListener(dialog->lock())
                    .setPositiveButton(text("Confirmar con huella","Confirm with biometrics"),(dialog,which)->authorizeSolana(profile,service,draft,ticket)).show();
            });
        }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch)status.setText(text("No se pudo preparar: revisa dirección, saldo, comisión o un envío pendiente. No se envió esta solicitud.","Cannot prepare: check address, balance, fee or pending transfer. This request was not sent."));});}});
    }
    private void authorizeSolana(NativeWalletProfiles.Profile profile,SolanaNativeTransfers service,SolanaNativeTransfers.Draft draft,long ticket){
        if(ticket!=epoch)return;
        worker.execute(()->{try{
            HardwareWalletVault selected=new HardwareWalletVault(this,profile.ownerId,profile.vaultId);
            var operation=selected.prepareOpen();
            runOnUiThread(()->{if(ticket!=epoch){selected.cancel();return;}vault=selected;cancellation=new CancellationSignal();
                new BiometricPrompt.Builder(this).setTitle(text("Autorizar envío real de SOL","Authorize real SOL transfer"))
                    .setSubtitle(new BigDecimal(draft.units,9).toPlainString()+" SOL · Solana mainnet")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .setNegativeButton(text("Cancelar","Cancel"),getMainExecutor(),(dialog,which)->lock()).build()
                    .authenticate(new BiometricPrompt.CryptoObject(operation.authenticationCipher()),cancellation,getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
                        @Override public void onAuthenticationError(int code,CharSequence reason){if(ticket==epoch)lock();}
                        @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result){
                            if(ticket!=epoch)return;
                            if(result.getCryptoObject()==null||result.getCryptoObject().getCipher()!=operation.authenticationCipher()){error(ticket);return;}
                            worker.execute(()->{byte[][] signature=new byte[1][];try{
                                if(ticket!=epoch)return;
                                operation.completeOpen(entropy->signature[0]=service.signReviewed(draft,entropy,new SolanaNativeTransfers.Signer(){
                                    public String address(byte[] input){return NativeHdWallet.addresses(input).solana;}
                                    public byte[] sign(byte[] input,byte[] message){return NativeHdWallet.signSolana(input,message);}
                                }));
                                String id=service.submit(draft,signature[0],()->ticket==epoch);
                                runOnUiThread(()->{if(ticket==epoch)status.setText(text("Envío presentado; falta confirmar en la red. No repitas.\n","Transfer submitted; network confirmation pending. Do not repeat.\n")+id);});
                            }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch)status.setText(text("No hay confirmación de este intento. Consulta el último envío antes de repetir; podría haberse transmitido.","This attempt is not confirmed. Check the latest transfer before retrying; it may have been broadcast."));});}
                            finally{if(signature[0]!=null)Arrays.fill(signature[0],(byte)0);selected.cancel();}});
                        }
                    });
            });
        }catch(Exception failure){error(ticket);}});
    }
    private void checkSolana(){
        NativeWalletProfiles.Profile profile=selectedProfile;if(profile==null){status.setText(text("Desbloquea primero la billetera.","Unlock the wallet first."));return;}
        long ticket=epoch;worker.execute(()->{try{
            var record=new SolanaNativeTransfers(this,profile).checkLatest();
            String result=record==null?text("No hay envíos registrados.","No recorded transfers."):record.phase.name()+"\n"+record.transactionId;
            runOnUiThread(()->{if(ticket==epoch)status.setText(result);});
        }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch)status.setText(text("No se pudo consultar. No repitas el envío hasta aclarar su estado.","Status unavailable. Do not resend until its state is resolved."));});}});
    }
    private void reviewBnb(){
        NativeWalletProfiles.Profile profile=selectedProfile;
        if(profile==null){status.setText(text("Desbloquea primero la billetera.","Unlock the wallet first."));return;}
        String to=bnbRecipient.getText().toString().trim(),amount=bnbAmount.getText().toString().trim();
        lock();selectedProfile=profile;long ticket=epoch;
        status.setText(text("Preparando revisión BNB; no se envía todavía.","Preparing BNB review; nothing is sent yet."));
        worker.execute(()->{try{
            BnbTransferReview service=new BnbTransferReview(this,profile);var draft=service.prepare(to,amount);
            runOnUiThread(()->{if(ticket!=epoch)return;
                String review="BNB Smart Chain MAINNET · 56\n\n"+text("Desde: ","From: ")+draft.from+"\n\n"+text("Destino: ","To: ")+draft.recipient+
                    "\n\nBNB: "+new BigDecimal(draft.units,18).toPlainString()+"\n"+text("Comisión máxima BNB: ","Maximum BNB fee: ")+new BigDecimal(draft.maximumFee,18).toPlainString()+
                    "\n\n"+text("Dinero real. Comprueba la dirección completa. La siguiente huella autoriza este envío.","Real funds. Check the full address. The next biometric approval authorizes this transfer.");
                new AlertDialog.Builder(this).setTitle(text("Revisar antes de enviar","Review before sending")).setMessage(review)
                    .setNegativeButton(text("Cancelar","Cancel"),(dialog,which)->lock()).setOnCancelListener(dialog->lock())
                    .setPositiveButton(text("Confirmar con huella","Confirm with biometrics"),(dialog,which)->authorizeBnb(profile,service,draft,ticket)).show();
            });
        }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch)status.setText(text("No se pudo preparar BNB. Revisa dirección, saldo y envíos pendientes. Esta solicitud no fue enviada.","Cannot prepare BNB. Check address, balance and pending transfers. This request was not sent."));});}});
    }
    private void authorizeBnb(NativeWalletProfiles.Profile profile,BnbTransferReview service,BnbTransferReview.Draft draft,long ticket){
        if(ticket!=epoch)return;
        worker.execute(()->{try{
            HardwareWalletVault selected=new HardwareWalletVault(this,profile.ownerId,profile.vaultId);var operation=selected.prepareOpen();
            runOnUiThread(()->{if(ticket!=epoch){selected.cancel();return;}vault=selected;cancellation=new CancellationSignal();
                new BiometricPrompt.Builder(this).setTitle(text("Autorizar envío real de BNB","Authorize real BNB transfer"))
                    .setSubtitle(new BigDecimal(draft.units,18).toPlainString()+" BNB · Smart Chain 56")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .setNegativeButton(text("Cancelar","Cancel"),getMainExecutor(),(dialog,which)->lock()).build()
                    .authenticate(new BiometricPrompt.CryptoObject(operation.authenticationCipher()),cancellation,getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
                        @Override public void onAuthenticationError(int code,CharSequence reason){if(ticket==epoch)lock();}
                        @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result){
                            if(ticket!=epoch)return;
                            if(result.getCryptoObject()==null||result.getCryptoObject().getCipher()!=operation.authenticationCipher()){error(ticket);return;}
                            worker.execute(()->{try{
                                if(ticket!=epoch)return;
                                BnbTransferReview.Signed[] signed=new BnbTransferReview.Signed[1];
                                operation.completeOpen(entropy->signed[0]=service.signReviewed(draft,entropy));
                                String id=service.submit(signed[0],()->ticket==epoch);
                                runOnUiThread(()->{if(ticket==epoch)status.setText(text("BNB presentado; falta confirmación de la red. No repitas.\n","BNB submitted; network confirmation pending. Do not repeat.\n")+id);});
                            }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch)status.setText(text("Resultado BNB sin confirmar. Consulta el último envío antes de repetir; podría haberse transmitido.","BNB outcome unconfirmed. Check the latest transfer before retrying; it may have been broadcast."));});}
                            finally{selected.cancel();}});
                        }
                    });
            });
        }catch(Exception failure){error(ticket);}});
    }
    private void checkBnb(){
        NativeWalletProfiles.Profile profile=selectedProfile;if(profile==null){status.setText(text("Desbloquea primero la billetera.","Unlock the wallet first."));return;}
        long ticket=epoch;worker.execute(()->{try{
            var record=new BnbTransferReview(this,profile).checkLatest();String result=record==null?text("No hay envíos BNB registrados.","No recorded BNB transfers."):record.phase.name()+"\n"+record.transactionId;
            runOnUiThread(()->{if(ticket==epoch)status.setText(result);});
        }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch)status.setText(text("No se pudo consultar BNB. No repitas hasta aclarar su estado.","BNB status unavailable. Do not resend until its state is resolved."));});}});
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
    private void lock(){epoch++;selectedProfile=null;if(cancellation!=null)cancellation.cancel();cancellation=null;if(vault!=null)vault.cancel();vault=null;if(enrollment!=null)enrollment.cancel();if(password!=null)password.setText("");if(passwordRepeat!=null)passwordRepeat.setText("");if(addresses!=null)addresses.setText("");if(status!=null)status.setText(text("Billetera bloqueada.","Wallet locked."));}
    @Override protected void onStop(){lock();super.onStop();}
    @Override protected void onDestroy(){lock();worker.shutdownNow();super.onDestroy();}
}
