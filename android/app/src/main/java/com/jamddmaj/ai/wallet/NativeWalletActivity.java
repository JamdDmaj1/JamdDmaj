package com.jamddmaj.ai.wallet;

import android.app.Activity;
import android.app.AlertDialog;
import java.math.BigDecimal;
import android.content.Intent;
import android.content.ClipData;
import android.content.ClipboardManager;
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
import android.view.MotionEvent;
import android.widget.*;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Protected native Assets screen inside the main app; keys never cross the WebView bridge. */
public final class NativeWalletActivity extends Activity {
    interface ConfirmationReader { NativeTransferJournal.Record latest(NativeWalletProfiles.Profile profile) throws Exception; }
    ConfirmationReader confirmationReader=profile->new SolanaNativeTransfers(this,profile).checkLatest();
    interface ClosePositionReader {boolean closed(NativeWalletProfiles.Profile profile,String asset,int side,java.math.BigInteger minimumSlot)throws Exception;}
    ClosePositionReader closePositionReader=(profile,asset,side,minimumSlot)->new NativePerpsCloseChain().isClosed(profile.solanaAddress,asset,side,minimumSlot);
    interface CancellationReader {boolean absent(NativeWalletProfiles.Profile profile,NativeTransferJournal.Perps metadata)throws Exception;}
    CancellationReader cancellationReader=(profile,p)->new NativePerpsCloseChain().cancellationAbsent(p.requestAddress,profile.solanaAddress,p.asset,p.side,p.requestCounter,p.minimumSlot);
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private volatile long epoch;
    private HardwareWalletVault vault;
    private CancellationSignal cancellation;
    private TextView status,addresses,accessCheckStatus;
    private LinearLayout accounts;
    private boolean es;
    private NativeWalletEnrollment enrollment;
    private EditText walletName,password,passwordRepeat;
    private byte[] exportBackup,openedBackup;
    private String recoveryOwner;
    private NativeWalletProfiles.Profile selectedProfile;
    private EditText recipient,sendAmount;
    private EditText bnbRecipient,bnbAmount;
    private EditText swapInput,swapOutput,swapAmount;
    private TextView swapAmountUnit;
    private EditText usdcRecipient,usdcAmount;
    private Spinner perpsAsset,perpsSide;
    private EditText perpsMargin,perpsLeverage,perpsPrice,perpsSl,perpsTp;
    private volatile NativePerpsTransfers perpsService;
    private volatile NativePerpsCloseTransfers perpsCloseService;
    private volatile NativePerpsCancelTransfers perpsCancelService;
    private volatile NativePerpsConversionTransfers perpsConversionService;
    private Spinner perpsExits;
    private final java.util.ArrayList<NativePerpsCancelIntent> pendingPerpsExits=new java.util.ArrayList<>();
    private final java.util.ArrayList<LinearLayout> sections=new java.util.ArrayList<>();
    private LinearLayout backupSection;
    private SeedCreationDialog seedDialog;
    private String text(String spanish,String english){return es?spanish:english;}
    @Override public boolean dispatchTouchEvent(MotionEvent event){
        // Reject taps when another app covers any part of this financial screen.
        if((event.getFlags()&(MotionEvent.FLAG_WINDOW_IS_OBSCURED|MotionEvent.FLAG_WINDOW_IS_PARTIALLY_OBSCURED))!=0)return false;
        return super.dispatchTouchEvent(event);
    }
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        es=Locale.getDefault().getLanguage().equals("es");
        enrollment=new NativeWalletEnrollment(this);
        ScrollView scroll=new ScrollView(this);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
        int padding=(int)(20*getResources().getDisplayMetrics().density);root.setPadding(padding,padding,padding,padding);scroll.addView(root);
        LinearLayout shell=new LinearLayout(this);shell.setOrientation(LinearLayout.VERTICAL);shell.setBackgroundColor(NativeWalletStyle.BACKGROUND);shell.setTag("native-wallet-shell");
        shell.setOnApplyWindowInsetsListener((view,insets)->{
            android.graphics.Insets safe=insets.getInsets(android.view.WindowInsets.Type.systemBars()|android.view.WindowInsets.Type.displayCutout());
            view.setPadding(safe.left,safe.top,safe.right,safe.bottom);return insets;
        });
        LinearLayout header=new LinearLayout(this);header.setGravity(android.view.Gravity.CENTER_VERTICAL);header.setPadding(padding,0,padding,0);
        Button back=new Button(this);back.setText(text("‹ Activos","‹ Assets"));NativeWalletStyle.button(back);
        back.setTag("wallet-back-to-assets");back.setContentDescription(text("Volver a Activos de JamdDmaj","Return to JamdDmaj Assets"));
        header.addView(back,new LinearLayout.LayoutParams(-2,-2));back.setOnClickListener(view->returnToAssets());
        TextView brand=new TextView(this);brand.setText("JamdDmaj");NativeWalletStyle.label(brand,20);brand.setGravity(android.view.Gravity.END);
        header.addView(brand,new LinearLayout.LayoutParams(0,-2,1));shell.addView(header);
        shell.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(shell);shell.requestApplyInsets();
        label(root,text("Tus activos","Your assets"),24);
        label(root,text("Billetera propia · separada de Bitget y del simulador.","Own wallet · separate from Bitget and simulation."),16);
        label(root,text("Integración en verificación. No deposites hasta que el envío y la recuperación estén habilitados y comprobados.","Integration under verification. Do not deposit until sending and recovery are enabled and verified."),16);
        accounts=new LinearLayout(this);accounts.setOrientation(LinearLayout.VERTICAL);root.addView(accounts);
        addresses=label(root,"",17);addresses.setTextIsSelectable(true);
        status=label(root,"",16);
        accessCheckStatus=label(root,"",16);accessCheckStatus.setTag("native-wallet-access-check-result");
        LinearLayout receiveSection=section(root,text("Recibir · elegir red","Receive · choose network"));
        action(receiveSection,text("Ver dirección para recibir SOL","View SOL receiving address"),()->receive(WalletNetwork.SOLANA_MAINNET));
        action(receiveSection,text("Ver dirección para recibir BNB","View BNB receiving address"),()->receive(WalletNetwork.BNB_MAINNET));
        backupSection=section(root,text("Crear o recuperar billetera","Create or recover wallet"));
        walletName=field(backupSection,text("Nombre de la billetera","Wallet name"),false);
        password=field(backupSection,text("Contraseña del respaldo: mínimo 16 caracteres","Backup password: at least 16 characters"),true);
        passwordRepeat=field(backupSection,text("Repite la contraseña al crear","Repeat password when creating"),true);
        action(backupSection,text("Crear con frase semilla aleatoria","Create with a random seed phrase"),()->createSeedWallet());
        action(backupSection,text("1. Crear respaldo cifrado","1. Create encrypted backup"),()->createBackup());
        action(backupSection,text("2. Abrir respaldo guardado","2. Open saved backup"),()->{
            lock();openedBackup=null;
            startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/octet-stream").addCategory(Intent.CATEGORY_OPENABLE),202);
        });
        action(backupSection,text("3. Recuperar y proteger con huella","3. Recover and protect with biometrics"),()->recover());
        LinearLayout solSection=section(root,text("Enviar SOL · Solana","Send SOL · Solana"));
        label(solSection,text("Envío manual · SOL en Solana mainnet","Manual transfer · SOL on Solana mainnet"),18);
        recipient=field(solSection,text("Dirección de destino Solana","Solana destination address"),false);
        sendAmount=field(solSection,text("Cantidad de SOL","SOL amount"),false);
        sendAmount.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);
        action(solSection,text("Revisar envío de SOL","Review SOL transfer"),()->reviewSolana());
        action(solSection,text("Consultar último envío de SOL","Check latest SOL transfer"),()->checkSolana());
        LinearLayout bnbSection=section(root,text("Enviar BNB · Smart Chain","Send BNB · Smart Chain"));
        label(bnbSection,text("Envío manual · BNB Smart Chain","Manual transfer · BNB Smart Chain"),18);
        bnbRecipient=field(bnbSection,text("Dirección de destino BNB (0x…)","BNB destination address (0x…)"),false);
        bnbAmount=field(bnbSection,text("Cantidad de BNB","BNB amount"),false);
        bnbAmount.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);
        action(bnbSection,text("Revisar envío de BNB","Review BNB transfer"),()->reviewBnb());
        action(bnbSection,text("Consultar último envío de BNB","Check latest BNB transfer"),()->checkBnb());
        LinearLayout swapSection=section(root,text("Intercambiar tokens · Solana","Swap tokens · Solana"));
        label(swapSection,text("Intercambio manual en Solana. Revisa los tokens y confirma cada operación con tu huella. Deslizamiento máximo: 0,50%.","Manual swap on Solana. Review the tokens and approve each operation with biometrics. Maximum slippage: 0.50%."),16);
        swapInput=field(swapSection,text("Token que entregas · dirección mint","Input token · mint address"),false);
        swapOutput=field(swapSection,text("Token que recibes · dirección mint","Output token · mint address"),false);
        swapInput.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        swapOutput.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        swapInput.setText(NativeSwapSetup.SOL);swapOutput.setText(NativeSolanaTokens.USDC);
        action(swapSection,"SOL → USDC",()->{swapInput.setText(NativeSwapSetup.SOL);swapOutput.setText(NativeSolanaTokens.USDC);});
        action(swapSection,"USDC → SOL",()->{swapInput.setText(NativeSolanaTokens.USDC);swapOutput.setText(NativeSwapSetup.SOL);});
        swapAmountUnit=label(swapSection,"",16);swapAmountUnit.setTag("swap-amount-unit");
        swapAmount=field(swapSection,text("Cantidad del token que entregas, no dólares","Input token quantity, not dollars"),false);
        swapAmount.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);
        swapInput.addTextChangedListener(new android.text.TextWatcher(){
            public void beforeTextChanged(CharSequence s,int start,int count,int after){}
            public void onTextChanged(CharSequence s,int start,int before,int count){swapAmount.setText("");updateSwapAmountUnit();}
            public void afterTextChanged(android.text.Editable value){}
        });
        updateSwapAmountUnit();
        action(swapSection,text("Revisar intercambio","Review swap"),()->reviewSwap());
        action(swapSection,text("Consultar última operación de Solana","Check latest Solana operation"),()->checkSolana());
        LinearLayout usdcSection=section(root,text("Enviar USDC · Solana","Send USDC · Solana"));
        label(usdcSection,text("Solo USDC en Solana. Introduce la dirección de la billetera de destino, no una dirección de otra red. Necesitas SOL para la comisión y, si corresponde, crear su cuenta USDC.","USDC on Solana only. Enter the recipient wallet address, not an address on another network. SOL is required for the fee and, if needed, its USDC account creation."),16);
        usdcRecipient=field(usdcSection,text("Billetera de destino · Solana","Recipient wallet · Solana"),false);
        usdcAmount=field(usdcSection,text("Cantidad de USDC","USDC amount"),false);
        usdcAmount.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);
        action(usdcSection,text("Revisar envío de USDC","Review USDC transfer"),()->reviewUsdc());
        action(usdcSection,text("Consultar última operación de Solana","Check latest Solana operation"),()->checkSolana());
        LinearLayout perpsSection=section(root,text("Futuros · revisar orden Jupiter","Futures · review Jupiter order"));
        perpsSection.setTag("native-perps-form");
        label(perpsSection,text("Futuros reales en Jupiter. Revisa margen, costos y riesgo; cada orden requiere una confirmación independiente con huella. Puedes perder todo el margen.","Real Jupiter Futures. Review margin, costs and risk; every order requires independent biometric confirmation. You can lose all margin."),16);
        perpsAsset=new Spinner(this);perpsAsset.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,new String[]{"BTC","ETH","SOL"}));perpsSection.addView(perpsAsset);
        perpsSide=new Spinner(this);perpsSide.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,new String[]{"Long","Short"}));perpsSection.addView(perpsSide);
        perpsMargin=field(perpsSection,text("Margen que entregas · USDC (mínimo 10)","Margin you pay · USDC (minimum 10)"),false);
        perpsLeverage=field(perpsSection,text("Apalancamiento · 1.1 a 50","Leverage · 1.1 to 50"),false);
        perpsPrice=field(perpsSection,text("Precio de referencia · USD (obligatorio)","Reference price · USD (required)"),false);
        perpsSl=field(perpsSection,text("Stop loss · precio USD · opcional","Stop loss · USD price · optional"),false);
        perpsTp=field(perpsSection,text("Take profit · precio USD · opcional","Take profit · USD price · optional"),false);
        for(EditText input:new EditText[]{perpsMargin,perpsLeverage,perpsPrice,perpsSl,perpsTp})input.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);
        action(perpsSection,text("Revisar orden de Futuros","Review Futures order"),()->reviewPerps());
        label(perpsSection,text("Para cerrar: selecciona el mercado y la dirección de tu posición y escribe un precio de referencia actual. Se cierra toda la posición existente; el margen y apalancamiento de arriba no se usan. El recibo será el token de garantía, no una conversión automática a USDC.","To close: select your position's market and direction and enter a current reference price. This closes the entire existing position; margin and leverage above are not used. You receive the collateral token, not an automatic conversion to USDC."),16);
        action(perpsSection,text("Revisar cierre completo","Review full close"),()->reviewPerpsClose());
        label(perpsSection,text("Después del cierre: consulta los TP/SL restantes de este mercado y dirección. Cada cancelación se revisa y autoriza por separado; no elimina protecciones de una posición abierta.","After closing: read the remaining TP/SL for this market and direction. Each cancellation is reviewed and authorized separately; protections of an open position are not removed."),16);
        action(perpsSection,text("Consultar TP/SL restantes","Read remaining TP/SL"),()->readPerpsExits());
        perpsExits=new Spinner(this);perpsExits.setTag("native-perps-pending-exits");perpsSection.addView(perpsExits);
        action(perpsSection,text("Revisar cancelación seleccionada","Review selected cancellation"),()->reviewPerpsCancellation());
        label(perpsSection,text("Conversión después del cierre: convierte solo el importe recibido y finalizado a USDC, con mínimo protegido y otra huella. Si ya recibiste USDC, no se intercambia de nuevo.","Conversion after closing: convert only the finalized received amount to USDC, with a protected minimum and another biometric approval. If you already received USDC, it is not swapped again."),16);
        action(perpsSection,text("Consultar recibo del cierre y conversión","Check close receipt and conversion"),()->checkPerpsSettlement());
        action(perpsSection,text("Revisar conversión a USDC","Review conversion to USDC"),()->reviewPerpsConversion());
        action(perpsSection,text("Consultar última operación de Solana","Check latest Solana operation"),()->checkSolana());
        action(root,text("Bloquear billetera","Lock wallet"),()->lock());
        if("perps".equals(getIntent().getStringExtra("wallet-navigation"))){
            if(getIntent().hasExtra("perps-asset"))try{
                NativePerpsOrderIntent draft=NativePerpsNavigation.readDraft(getIntent());
                perpsAsset.setSelection("BTC".equals(draft.asset)?0:"ETH".equals(draft.asset)?1:2);perpsSide.setSelection(draft.side-1);
                perpsMargin.setText(NativePerpsReviewAmounts.usd(draft.marginUsd));
                perpsLeverage.setText((draft.leverageTenths/10)+"."+(draft.leverageTenths%10));
                perpsPrice.setText(NativePerpsReviewAmounts.usd(draft.referencePrice));
                perpsSl.setText(draft.stopLoss==null?"":NativePerpsReviewAmounts.usd(draft.stopLoss));
                perpsTp.setText(draft.takeProfit==null?"":NativePerpsReviewAmounts.usd(draft.takeProfit));
            }catch(Exception invalid){status.setText(text("Borrador inválido. Introduce la orden de nuevo.","Invalid draft. Enter the order again."));}
            perpsSection.setVisibility(View.VISIBLE);
            perpsSection.post(()->perpsSection.requestRectangleOnScreen(new android.graphics.Rect(0,0,perpsSection.getWidth(),perpsSection.getHeight()),false));
        }
        if("swap".equals(getIntent().getStringExtra("wallet-navigation"))){
            swapSection.setVisibility(View.VISIBLE);
            swapSection.post(()->swapSection.requestRectangleOnScreen(new android.graphics.Rect(0,0,swapSection.getWidth(),swapSection.getHeight()),false));
        }
    }
    void returnToAssets(){lock();finish();}
    private void createSeedWallet(){
        char[] pass=take(password),repeat=take(passwordRepeat);
        if(pass.length<16||!Arrays.equals(pass,repeat)){Arrays.fill(pass,'\0');Arrays.fill(repeat,'\0');status.setText(text("Las contraseñas deben coincidir y tener al menos 16 caracteres.","Passwords must match and contain at least 16 characters."));return;}
        Arrays.fill(repeat,'\0');lock();recoveryOwner=null;openedBackup=null;long ticket=epoch;
        worker.execute(()->{byte[] entropy=new byte[WalletRecoveryProfile.ENTROPY_BYTES];byte[] encrypted=null;char[] phrase=null;
            try{
                new java.security.SecureRandom().nextBytes(entropy);
                phrase=NativeHdWallet.open(entropy).mnemonic().toCharArray();
                encrypted=PortableWalletBackup.seal(entropy,pass);
                final char[] display=phrase.clone(),secret=pass.clone();final byte[] backup=encrypted.clone();
                runOnUiThread(()->{try{if(ticket!=epoch)return;
                    seedDialog=new SeedCreationDialog(this,display,backup,secret,es,(bytes,chosenPassword)->{
                        if(ticket!=epoch)return;openedBackup=bytes.clone();password.setText(new String(chosenPassword));recover();
                    });seedDialog.show();
                }finally{Arrays.fill(display,'\0');Arrays.fill(secret,'\0');Arrays.fill(backup,(byte)0);}});
            }catch(Exception failure){error(ticket);}finally{Arrays.fill(entropy,(byte)0);Arrays.fill(pass,'\0');if(phrase!=null)Arrays.fill(phrase,'\0');if(encrypted!=null)Arrays.fill(encrypted,(byte)0);}
        });
    }
    private LinearLayout section(LinearLayout root,String title){
        LinearLayout panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);panel.setVisibility(View.GONE);sections.add(panel);
        action(root,title,()->{boolean opening=panel.getVisibility()!=View.VISIBLE;for(LinearLayout other:sections)other.setVisibility(View.GONE);if(opening)panel.setVisibility(View.VISIBLE);if(password!=null)password.setText("");if(passwordRepeat!=null)passwordRepeat.setText("");});
        root.addView(panel);return panel;
    }
    void showRecoveryForm(){
        for(LinearLayout panel:sections)panel.setVisibility(panel==backupSection?View.VISIBLE:View.GONE);
        password.setText("");passwordRepeat.setText("");
        backupSection.post(()->backupSection.requestRectangleOnScreen(new android.graphics.Rect(0,0,backupSection.getWidth(),backupSection.getHeight()),false));
    }
    private EditText field(LinearLayout root,String hint,boolean secret){
        EditText value=new EditText(this);value.setHint(hint);value.setSaveEnabled(false);
        value.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        value.setInputType(InputType.TYPE_CLASS_TEXT|(secret?InputType.TYPE_TEXT_VARIATION_PASSWORD:InputType.TYPE_TEXT_FLAG_CAP_SENTENCES));NativeWalletStyle.field(value);root.addView(value);return value;
    }
    private void receive(WalletNetwork network){
        NativeWalletProfiles.Profile profile=selectedProfile;
        if(profile==null){status.setText(text("Desbloquea primero la billetera para verificar su dirección.","Unlock the wallet first to verify its address."));return;}
        final long ticket=epoch;String address=profile.address(network);
        String chain=network==WalletNetwork.SOLANA_MAINNET?"Solana mainnet · SOL":"BNB Smart Chain · BNB (56)";
        String warning=text("Esta pantalla aún está en verificación. No deposites todavía.\n\nRed: ","This screen is still under verification. Do not deposit yet.\n\nNetwork: ")+chain+
            "\n\n"+address+"\n\n"+text("No uses redes de prueba ni envíes desde una red distinta. La misma apariencia de dirección no significa que las redes sean intercambiables.","Do not use test networks or send from a different chain. Similar-looking addresses do not make networks interchangeable.");
        WalletReviewDialog.show(this,text("Dirección de tu billetera","Your wallet address"),warning,text("Copiar dirección","Copy address"),()->{
                if(ticket!=epoch||selectedProfile!=profile)return;
                ClipboardManager clipboard=getSystemService(ClipboardManager.class);
                if(clipboard!=null){clipboard.setPrimaryClip(ClipData.newPlainText(chain,address));status.setText(text("Dirección copiada para ","Address copied for ")+chain);}
            },text("Cerrar","Close"),()->{});
    }
    private void action(LinearLayout root,String caption,Runnable action){Button button=new Button(this);button.setText(caption);NativeWalletStyle.button(button);root.addView(button);button.setOnClickListener(v->action.run());}
    private char[] take(EditText field){char[] chars=new char[field.length()];field.getText().getChars(0,chars.length,chars,0);field.setText("");return chars;}
    private void createBackup(){
        char[] pass=take(password),repeat=take(passwordRepeat);
        if(pass.length<16||pass.length>1024){Arrays.fill(pass,'\0');Arrays.fill(repeat,'\0');status.setText(text("La contraseña del respaldo debe tener entre 16 y 1024 caracteres. No se creó ningún archivo.","Backup password must contain 16 to 1024 characters. No file was created."));return;}
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
        if(result!=RESULT_OK||data==null||data.getData()==null){if(outgoing!=null)Arrays.fill(outgoing,(byte)0);status.setText(text("Selección cancelada.","Selection cancelled."));return;}
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
        }catch(Exception failure){runOnUiThread(()->{if(ticket!=epoch)return;status.setText(request==201?text("No se pudo guardar el archivo. Elige una carpeta accesible y vuelve a crear el respaldo; no borres los respaldos anteriores.","Could not save the file. Choose an accessible folder and create the backup again; do not delete previous backups."):text("No se pudo abrir un respaldo compatible. Selecciona el archivo .jamdhd original y comprueba el permiso de lectura.","Could not open a compatible backup. Select the original .jamdhd file and check read access."));});}finally{if(outgoing!=null)Arrays.fill(outgoing,(byte)0);}});
    }
    private void recover(){
        if(openedBackup==null||Build.VERSION.SDK_INT<30){status.setText(text("Abre un respaldo compatible primero. Requiere Android 11 o posterior.","Open a compatible backup first. Android 11 or later required."));return;}
        byte[] encrypted=openedBackup.clone();char[] pass=take(password);String name=walletName.getText().toString().trim(),owner=recoveryOwner;
        if(name.isEmpty()||name.length()>60||name.chars().anyMatch(Character::isISOControl)){Arrays.fill(pass,'\0');Arrays.fill(encrypted,(byte)0);status.setText(text("Introduce un nombre de billetera de 1 a 60 caracteres y vuelve a escribir la contraseña.","Enter a wallet name of 1 to 60 characters and re-enter the password."));return;}
        if(pass.length<16||pass.length>1024){Arrays.fill(pass,'\0');Arrays.fill(encrypted,(byte)0);status.setText(text("Introduce la contraseña original del respaldo (16–1024 caracteres).","Enter the original backup password (16–1024 characters)."));return;}
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
        }catch(Exception failure){recoveryError(ticket,failure);}finally{Arrays.fill(pass,'\0');Arrays.fill(encrypted,(byte)0);}});
    }
    private TextView label(LinearLayout root,String value,int size){TextView view=new TextView(this);view.setText(value);NativeWalletStyle.label(view,size);root.addView(view);return view;}
    @Override protected void onResume(){super.onResume();loadProfiles();}
    private void loadProfiles(){
        long ticket=epoch;
        worker.execute(()->{try{
            var profiles=new NativeWalletProfiles(this).list();
            runOnUiThread(()->{if(ticket!=epoch)return;accounts.removeAllViews();
                if(profiles.isEmpty())status.setText(text("Aún no hay una billetera recuperada en este dispositivo.","No recovered wallet on this device yet."));
                NativeWalletProfiles.Profile publicSelection=null;
                try{publicSelection=new NativeWalletPublicSelection(this).selected();}catch(Exception unavailable){/* No display selection on corrupt metadata. */}
                String remembered=publicSelection==null?getSharedPreferences("wallet-selection",MODE_PRIVATE).getString("owner",""):publicSelection.ownerId;
                for(var known:profiles)if(known.ownerId.equals(remembered)){
                    addresses.setText(known.name+"\nSolana · "+known.solanaAddress+"\nBNB · "+known.bnbAddress);
                    selectedProfile=known;
                    status.setText(text("Consultando saldo público. La huella se solicita al autorizar una operación.","Checking public balance. Biometrics are requested to authorize a transaction."));
                    worker.execute(()->readBalances(known,ticket));break;
                }
                for(var profile:profiles){Button button=new Button(this);button.setText(profile.name+" · "+text("Ver saldo","View balance"));NativeWalletStyle.button(button);accounts.addView(button);button.setOnClickListener(v->viewPublicProfile(profile));
                    action(accounts,profile.name+" · "+text("Verificar huella sin operar","Verify biometrics without trading"),()->unlock(profile.ownerId));
                    action(accounts,profile.name+" · "+text("Recuperar acceso","Recover access"),()->{lock();openedBackup=null;recoveryOwner=profile.ownerId;walletName.setText(profile.name);showRecoveryForm();status.setText(text("Abre el respaldo de esta billetera para recuperar su acceso.","Open this wallet's backup to recover its access."));});}
            });
        }catch(Exception failure){error(ticket);}});
    }
    private void viewPublicProfile(NativeWalletProfiles.Profile profile){
        lock();long ticket=epoch;
        worker.execute(()->{try{
            new NativeWalletPublicSelection(this).select(profile);
            runOnUiThread(()->{if(ticket==epoch){selectedProfile=profile;addresses.setText(profile.name+"\nSolana · "+profile.solanaAddress);}});
            readBalances(profile,ticket);
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
                    .setSubtitle(text("Solo verificar acceso; no firma ni envía operaciones","Verify access only; no transaction signing or sending"))
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
                                if(ticket==epoch)getSharedPreferences("wallet-selection",MODE_PRIVATE).edit().putString("owner",profile.ownerId).apply();
                                runOnUiThread(()->{if(ticket==epoch){selectedProfile=profile;addresses.setText("Solana mainnet · SOL\n"+profile.solanaAddress+"\n\nBNB Smart Chain · BNB\n"+profile.bnbAddress);accessCheckStatus.setText(text("Acceso verificado con huella. No se firmó ni envió ninguna operación. Cada operación requiere su propia revisión y huella.","Biometric access verified. No transaction was signed or sent. Each transaction still requires its own review and biometric approval."));status.setText(text("Consultando saldos…","Checking balances…"));}});
                                readBalances(profile,ticket);
                            }catch(Exception failure){error(ticket);}});
                        }
                    });
            });
        }catch(Exception failure){error(ticket);}});
    }
    private void updateSwapAmountUnit(){
        String mint=swapInput.getText().toString().trim();
        String unit=NativeSwapSetup.SOL.equals(mint)?"SOL":NativeSolanaTokens.USDC.equals(mint)?"USDC":text("token","token");
        swapAmountUnit.setText(text("Cantidad que entregas en ","Amount you pay in ")+unit+
            (NativeSwapSetup.SOL.equals(mint)?text(" · 20 aquí significa 20 SOL, no 20 dólares."," · 20 here means 20 SOL, not 20 dollars."):text(" · No es una cantidad en dólares bancarios."," · This is not a bank-dollar amount.")));
        swapAmount.setHint(text("Cantidad en ","Amount in ")+unit);
        swapAmount.setContentDescription(text("Cantidad en ","Amount in ")+unit);
    }
    void reviewSwap(){
        NativeWalletProfiles.Profile profile=selectedProfile;
        if(profile==null){status.setText(text("Desbloquea primero la billetera.","Unlock the wallet first."));return;}
        String input=swapInput.getText().toString().trim(),output=swapOutput.getText().toString().trim(),amount=swapAmount.getText().toString().trim();
        lock();selectedProfile=profile;long ticket=epoch;
        status.setText(text("Comprobando cotización, saldos y simulación. No se firma ni se envía todavía.","Checking quote, balances and simulation. Nothing is signed or sent yet."));
        worker.execute(()->{try{
            NativeSwapTransfers service=new NativeSwapTransfers(this,profile);
            NativeSwapTransfers.Draft draft=service.prepareAmount(input,output,amount,50);
            runOnUiThread(()->{if(ticket!=epoch)return;
                String message=draft.review.description(es)+"\n\n"+text("Dinero real. Comprueba las direcciones completas de los tokens. La siguiente huella autoriza este intercambio. Si la cotización caduca, tendrás que revisarla de nuevo.","Real funds. Check the complete token addresses. The next biometric approval authorizes this swap. If the quote expires, you must review again.");
                WalletReviewDialog.show(this,text("Revisar intercambio","Review swap"),message,text("Confirmar con huella","Confirm with biometrics"),
                    ()->authorizeSwap(profile,service,draft,ticket),text("Cancelar","Cancel"),()->lock());
            });
        }catch(Exception failure){String check=NativeSwapCheck.publicCode(failure),explanation=NativeSwapCheck.describe(failure,es);runOnUiThread(()->{if(ticket==epoch)status.setText(explanation+"\n"+text("Esta solicitud no se firmó ni se envió.","This request was not signed or submitted.")+"\n"+check);});}});
    }
    void reviewPerps(){
        NativeWalletProfiles.Profile profile=selectedProfile;
        if(profile==null){status.setText(text("Desbloquea primero la billetera.","Unlock the wallet first."));return;}
        if(perpsPrice.getText().toString().trim().isEmpty()){
            String explanation=text("Introduce el precio de referencia para comprobar la protección de precio. No se enviará ninguna orden.","Enter the reference price to check price protection. No order will be sent.");
            perpsPrice.setError(explanation);perpsPrice.requestFocus();status.setText(explanation);return;
        }
        NativePerpsOrderIntent intent;
        try{
            String sl=perpsSl.getText().toString().trim(),tp=perpsTp.getText().toString().trim();
            intent=new NativePerpsOrderIntent(perpsAsset.getSelectedItem().toString(),perpsSide.getSelectedItemPosition()+1,
                perpsMargin.getText().toString().trim(),perpsLeverage.getText().toString().trim(),50,
                perpsPrice.getText().toString().trim(),sl.isEmpty()?null:sl,tp.isEmpty()?null:tp);
        }catch(Exception invalid){status.setText(text("Revisa margen, apalancamiento, precio y TP/SL.","Check margin, leverage, price and TP/SL."));return;}
        lock();selectedProfile=profile;long ticket=epoch;
        NativePerpsTransfers service;
        try{service=new NativePerpsTransfers(this,profile);}catch(Exception unavailable){status.setText(text("No se pudo abrir el registro de operaciones. No se enviará nada.","Transaction storage unavailable. Nothing will be sent."));return;}
        perpsService=service;
        status.setText(text("Verificando orden y simulación. No se firma ni se envía.","Verifying order and simulation. Nothing is signed or sent."));
        worker.execute(()->{try{
            NativePerpsTransfers.Draft draft=service.prepare(intent);
            runOnUiThread(()->{if(ticket!=epoch){service.invalidate();return;}
                try{service.requireReview(draft,()->ticket==epoch);}catch(Exception expired){service.invalidate();status.setText(text("La revisión caducó. Solicita otra.","Review expired. Request another."));return;}
                WalletReviewDialog.show(this,text("Revisión de Futuros","Futures review"),draft.review.description(es),
                    text("Confirmar con huella","Confirm with biometrics"),()->authorizePerps(profile,service,draft,ticket),text("Cancelar","Cancel"),()->lock());
            });
        }catch(Exception failure){service.invalidate();
            String explanation=text("No se pudo verificar la orden: revisa saldo USDC, importe y disponibilidad. No se firmó ni envió nada.","Order could not be verified: check USDC funds, amount and availability. Nothing was signed or sent.");
            if(failure instanceof NativePerpsFundsPreflight.Failure){
                NativePerpsFundsPreflight.Failure funds=(NativePerpsFundsPreflight.Failure)failure;
                if("PERPS_INSUFFICIENT_USDC".equals(funds.reason))explanation=text("USDC insuficiente en esta billetera. Disponible: ","Insufficient USDC in this wallet. Available: ")+
                    NativePerpsReviewAmounts.usd(funds.availableUsdc)+text(" USDC. Margen solicitado: "," USDC. Requested margin: ")+NativePerpsReviewAmounts.usd(funds.requiredUsdc)+
                    text(" USDC. El saldo SOL no se convierte automáticamente en garantía. No se firmó ni envió nada."," USDC. SOL is not automatically converted into collateral. Nothing was signed or sent.");
                else if("PERPS_MISSING_SOL_FEES".equals(funds.reason))explanation=text("Esta billetera no tiene SOL para pagar comisiones de red. El saldo USDC no paga esas comisiones. No se firmó ni envió nada.","This wallet has no SOL for network fees. USDC does not pay those fees. Nothing was signed or sent.");
            }
            if("PERPS_POSITION_REQUESTS_REQUIRE_REVIEW".equals(failure.getMessage()))explanation=text("Esta posición tiene solicitudes pendientes, como TP/SL de una operación anterior. Deben revisarse y resolverse por separado antes de añadir exposición. No se firmó ni envió nada.","This position has pending requests, such as TP/SL from an earlier trade. Review and resolve them separately before adding exposure. Nothing was signed or sent.");
            final String message=explanation;runOnUiThread(()->{if(ticket==epoch)status.setText(message);});}});
    }
    private void authorizePerps(NativeWalletProfiles.Profile profile,NativePerpsTransfers service,NativePerpsTransfers.Draft draft,long ticket){
        if(ticket!=epoch)return;
        worker.execute(()->{try{
            service.requireReview(draft,()->ticket==epoch);
            HardwareWalletVault selected=new HardwareWalletVault(this,profile.ownerId,profile.vaultId);
            var operation=selected.prepareOpen();
            runOnUiThread(()->{if(ticket!=epoch){selected.cancel();return;}vault=selected;cancellation=new CancellationSignal();
                new BiometricPrompt.Builder(this).setTitle(text("Autorizar orden de Futuros real","Authorize real Futures order"))
                    .setSubtitle(draft.review.analysis.intent.asset+" · "+NativePerpsReviewAmounts.usd(draft.review.amounts.walletDebitUsdc)+" USDC")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .setNegativeButton(text("Cancelar","Cancel"),getMainExecutor(),(dialog,which)->lock()).build()
                    .authenticate(new BiometricPrompt.CryptoObject(operation.authenticationCipher()),cancellation,getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
                        @Override public void onAuthenticationError(int code,CharSequence reason){if(ticket==epoch)lock();}
                        @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result){
                            if(ticket!=epoch)return;
                            if(result.getCryptoObject()==null||result.getCryptoObject().getCipher()!=operation.authenticationCipher()){lock();return;}
                            worker.execute(()->{byte[][] signature=new byte[1][];try{
                                if(ticket!=epoch)return;
                                operation.completeOpen(entropy->signature[0]=service.signReviewed(draft,entropy,new SolanaNativeTransfers.Signer(){
                                    public String address(byte[] input){return NativeHdWallet.addresses(input).solana;}
                                    public byte[] sign(byte[] input,byte[] message){return NativeHdWallet.signSolana(input,message);}
                                },()->ticket==epoch));
                                String id=service.submit(draft,signature[0],()->ticket==epoch);
                                runOnUiThread(()->{if(ticket==epoch){status.setText(text("Orden presentada; comprobando confirmación. No repitas.\n","Order submitted; checking confirmation. Do not repeat.\n")+id);pollSwapConfirmation(profile,id,ticket,0);}});
                            }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch)status.setText(text("Orden no confirmada. Consulta la última operación de Solana antes de repetir: el intento podría haberse transmitido.","Order unconfirmed. Check the latest Solana operation before retrying: the attempt may have been broadcast."));});}
                            finally{if(signature[0]!=null)Arrays.fill(signature[0],(byte)0);service.invalidate();selected.cancel();}});
                        }
                    });
            });
        }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch){lock();status.setText(text("La autorización no está disponible o la revisión caducó. Revisa una orden nueva. No se envió esta solicitud.","Authorization unavailable or review expired. Review a fresh order. This request was not sent."));}});}});
    }
    private void authorizeSwap(NativeWalletProfiles.Profile profile,NativeSwapTransfers service,NativeSwapTransfers.Draft draft,long ticket){
        authorizeSwapApproval(profile,draft.review,new SwapApproval(){
            public void require()throws Exception{service.requireReview(draft,()->ticket==epoch);}
            public byte[] sign(byte[] entropy,SolanaNativeTransfers.Signer signer)throws Exception{return service.signReviewed(draft,entropy,signer,()->ticket==epoch);}
            public String submit(byte[] signature)throws Exception{return service.submit(draft,signature,()->ticket==epoch);}
            public void invalidate(){service.invalidate();}
        },ticket);
    }
    private interface SwapApproval {
        void require()throws Exception;
        byte[] sign(byte[] entropy,SolanaNativeTransfers.Signer signer)throws Exception;
        String submit(byte[] signature)throws Exception;
        void invalidate();
    }
    private void authorizeSwapApproval(NativeWalletProfiles.Profile profile,NativeSwapReview review,SwapApproval approval,long ticket){
        if(ticket!=epoch)return;
        worker.execute(()->{try{
            approval.require();
            HardwareWalletVault selected=new HardwareWalletVault(this,profile.ownerId,profile.vaultId);
            var operation=selected.prepareOpen();
            runOnUiThread(()->{if(ticket!=epoch){selected.cancel();return;}vault=selected;cancellation=new CancellationSignal();
                new BiometricPrompt.Builder(this).setTitle(text("Autorizar intercambio real","Authorize real swap"))
                    .setSubtitle("Solana mainnet · "+review.inputAmount+" · "+text("Mínimo ","Minimum ")+review.minimumOutput)
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .setNegativeButton(text("Cancelar","Cancel"),getMainExecutor(),(dialog,which)->lock()).build()
                    .authenticate(new BiometricPrompt.CryptoObject(operation.authenticationCipher()),cancellation,getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
                        @Override public void onAuthenticationError(int code,CharSequence reason){if(ticket==epoch)lock();}
                        @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result){
                            if(ticket!=epoch)return;
                            if(result.getCryptoObject()==null||result.getCryptoObject().getCipher()!=operation.authenticationCipher()){error(ticket);return;}
                            worker.execute(()->{byte[][] signature=new byte[1][];try{
                                if(ticket!=epoch)return;
                                operation.completeOpen(entropy->signature[0]=approval.sign(entropy,new SolanaNativeTransfers.Signer(){
                                    public String address(byte[] input){return NativeHdWallet.addresses(input).solana;}
                                    public byte[] sign(byte[] input,byte[] message){return NativeHdWallet.signSolana(input,message);}
                                }));
                                String id=approval.submit(signature[0]);
                                runOnUiThread(()->{if(ticket==epoch){status.setText(text("Intercambio presentado; comprobando confirmación. No repitas.\n","Swap submitted; checking confirmation. Do not repeat.\n")+id);pollSwapConfirmation(profile,id,ticket,0);}});
                            }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch)status.setText(text("Intercambio no confirmado. Consulta la última operación de Solana antes de repetir; el intento podría haberse transmitido.","Swap unconfirmed. Check the latest Solana operation before retrying; the attempt may have been broadcast."));});}
                            finally{if(signature[0]!=null)Arrays.fill(signature[0],(byte)0);approval.invalidate();selected.cancel();}});
                        }
                    });
            });
        }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch){lock();status.setText(text("La autorización no está disponible o la cotización caducó. Desbloquea y revisa el intercambio de nuevo. No se envió esta solicitud.","Authorization unavailable or quote expired. Unlock and review the swap again. This request was not sent."));}});}});
    }
    void checkPerpsSettlement(){
        NativeWalletProfiles.Profile profile=selectedProfile;if(profile==null){status.setText(text("Selecciona primero tu billetera.","Select your wallet first."));return;}
        String asset=perpsAsset.getSelectedItem().toString();int side=perpsSide.getSelectedItemPosition()+1;long ticket=epoch;
        worker.execute(()->{try{NativePerpsConversionTransfers service=new NativePerpsConversionTransfers(this,profile);String message=service.status(asset,side,es);service.invalidate();
            runOnUiThread(()->{if(ticket==epoch)status.setText(message);});
        }catch(Exception unavailable){runOnUiThread(()->{if(ticket==epoch)status.setText(text("Recibo finalizado aún no verificado. Consulta la última operación. No repitas una conversión pendiente; no se firmó ni envió nada.","Finalized receipt not yet verified. Check the latest operation. Do not repeat a pending conversion; nothing was signed or sent."));});}});
    }
    void reviewPerpsConversion(){
        NativeWalletProfiles.Profile profile=selectedProfile;if(profile==null){status.setText(text("Selecciona primero tu billetera.","Select your wallet first."));return;}
        String asset=perpsAsset.getSelectedItem().toString();int side=perpsSide.getSelectedItemPosition()+1;
        lock();selectedProfile=profile;long ticket=epoch;
        status.setText(text("Comprobando recibo finalizado y mínimo USDC. No se firma ni envía.","Checking finalized receipt and USDC minimum. Nothing is signed or sent."));
        worker.execute(()->{try{
            NativePerpsConversionTransfers service=new NativePerpsConversionTransfers(this,profile);perpsConversionService=service;
            NativePerpsConversionTransfers.Draft draft=service.prepare(asset,side);
            runOnUiThread(()->{if(ticket!=epoch){service.invalidate();return;}
                try{service.requireReview(draft,()->ticket==epoch);}catch(Exception expired){service.invalidate();status.setText(text("Cotización caducada; revisa otra conversión.","Quote expired; review another conversion."));return;}
                WalletReviewDialog.show(this,text("Revisar conversión independiente a USDC","Review separate conversion to USDC"),draft.description(es),text("Autorizar con huella","Authorize with biometrics"),()->{
                    authorizeSwapApproval(profile,draft.review,new SwapApproval(){
                        public void require()throws Exception{service.requireReview(draft,()->ticket==epoch);}
                        public byte[] sign(byte[] entropy,SolanaNativeTransfers.Signer signer)throws Exception{return service.signReviewed(draft,entropy,signer,()->ticket==epoch);}
                        public String submit(byte[] signature)throws Exception{return service.submit(draft,signature,()->ticket==epoch);}
                        public void invalidate(){service.invalidate();}
                    },ticket);
                },text("Cancelar","Cancel"),()->lock());
            });
        }catch(Exception failure){NativePerpsConversionTransfers service=perpsConversionService;if(service!=null)service.invalidate();
            runOnUiThread(()->{if(ticket==epoch)status.setText(text("Conversión no preparada. Comprueba el recibo finalizado, el saldo y las operaciones pendientes. Si ya recibiste USDC, no requiere conversión. No se firmó ni envió nada.","Conversion not prepared. Check the finalized receipt, funds and pending operations. If you already received USDC, no conversion is required. Nothing was signed or sent."));});}});
    }
    void reviewPerpsClose(){
        NativeWalletProfiles.Profile profile=selectedProfile;
        if(profile==null){status.setText(text("Desbloquea primero la billetera.","Unlock the wallet first."));return;}
        String asset=perpsAsset.getSelectedItem().toString(),price=perpsPrice.getText().toString().trim();int side=perpsSide.getSelectedItemPosition()+1;
        try{NativePerpsOrderIntent.usd(price);}catch(Exception invalid){String message=text("Introduce el precio de referencia actual para proteger el cierre. No se envió ninguna orden.","Enter a current reference price to protect the close. No order was sent.");perpsPrice.setError(message);perpsPrice.requestFocus();status.setText(message);return;}
        lock();selectedProfile=profile;long ticket=epoch;
        NativePerpsCloseTransfers service;
        try{service=new NativePerpsCloseTransfers(this,profile);}catch(Exception unavailable){status.setText(text("Registro de operaciones no disponible. No se enviará el cierre.","Transaction storage unavailable. The close will not be sent."));return;}
        perpsCloseService=service;status.setText(text("Consultando tu posición y simulando el cierre. No se firma ni envía.","Reading your position and simulating the close. Nothing is signed or sent."));
        worker.execute(()->{try{
            NativePerpsCloseTransfers.Draft draft=service.prepare(asset,side,price,50);
            runOnUiThread(()->{if(ticket!=epoch){service.invalidate();return;}
                try{service.requireReview(draft,()->ticket==epoch);}catch(Exception expired){service.invalidate();status.setText(text("La revisión del cierre caducó. Solicita otra.","Close review expired. Request another."));return;}
                WalletReviewDialog.show(this,text("Revisar cierre completo","Review full close"),draft.review.description(es),
                    text("Autorizar cierre con huella","Authorize close with biometrics"),()->authorizePerpsClose(profile,service,draft,ticket),text("Cancelar","Cancel"),()->lock());
            });
        }catch(Exception failure){service.invalidate();runOnUiThread(()->{if(ticket==epoch)status.setText(text("No se pudo verificar el cierre. Comprueba que exista una posición de ese mercado y dirección, el precio y las operaciones pendientes. No se firmó ni envió nada.","Close could not be verified. Check that a position exists for this market and direction, the reference price and pending operations. Nothing was signed or sent."));});}});
    }
    private void authorizePerpsClose(NativeWalletProfiles.Profile profile,NativePerpsCloseTransfers service,NativePerpsCloseTransfers.Draft draft,long ticket){
        if(ticket!=epoch)return;worker.execute(()->{try{
            service.requireReview(draft,()->ticket==epoch);HardwareWalletVault selected=new HardwareWalletVault(this,profile.ownerId,profile.vaultId);var operation=selected.prepareOpen();
            runOnUiThread(()->{if(ticket!=epoch){selected.cancel();return;}vault=selected;cancellation=new CancellationSignal();
                new BiometricPrompt.Builder(this).setTitle(text("Autorizar cierre real","Authorize real close"))
                    .setSubtitle(draft.review.intent.asset+" · "+text("Toda la posición","Entire position"))
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .setNegativeButton(text("Cancelar","Cancel"),getMainExecutor(),(dialog,which)->lock()).build()
                    .authenticate(new BiometricPrompt.CryptoObject(operation.authenticationCipher()),cancellation,getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
                        @Override public void onAuthenticationError(int code,CharSequence reason){if(ticket==epoch)lock();}
                        @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result){
                            if(ticket!=epoch)return;if(result.getCryptoObject()==null||result.getCryptoObject().getCipher()!=operation.authenticationCipher()){lock();return;}
                            worker.execute(()->{byte[][] signature=new byte[1][];try{
                                if(ticket!=epoch)return;operation.completeOpen(entropy->signature[0]=service.signReviewed(draft,entropy,new SolanaNativeTransfers.Signer(){
                                    public String address(byte[] input){return NativeHdWallet.addresses(input).solana;}
                                    public byte[] sign(byte[] input,byte[] message){return NativeHdWallet.signSolana(input,message);}
                                },()->ticket==epoch));
                                String id=service.submit(draft,signature[0],()->ticket==epoch);
                                runOnUiThread(()->{if(ticket==epoch){status.setText(text("Cierre presentado; comprobando confirmación. No repitas.\n","Close submitted; checking confirmation. Do not repeat.\n")+id);pollSwapConfirmation(profile,id,ticket,0);}});
                            }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch)status.setText(text("Cierre no confirmado. Consulta la última operación de Solana antes de repetir; el intento podría haberse transmitido.","Close unconfirmed. Check the latest Solana operation before retrying; the attempt may have been broadcast."));});}
                            finally{if(signature[0]!=null)Arrays.fill(signature[0],(byte)0);service.invalidate();selected.cancel();}});
                        }
                    });
            });
        }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch){lock();status.setText(text("La autorización del cierre no está disponible o caducó. Solicita una revisión nueva. No se envió esta solicitud.","Close authorization unavailable or expired. Request a fresh review. This request was not sent."));}});}});
    }
    void reviewUsdc(){
        NativeWalletProfiles.Profile profile=selectedProfile;
        if(profile==null){status.setText(text("Desbloquea primero la billetera.","Unlock the wallet first."));return;}
        String to=usdcRecipient.getText().toString().trim(),amount=usdcAmount.getText().toString().trim();
        lock();selectedProfile=profile;long ticket=epoch;
        status.setText(text("Comprobando USDC, comisión y destino. Todavía no se envía.","Checking USDC, fee and destination. Nothing is sent yet."));
        worker.execute(()->{try{
            NativeUsdcTransfers service=new NativeUsdcTransfers(this,profile);var draft=service.prepare(to,amount);
            runOnUiThread(()->{if(ticket!=epoch)return;
                String review="USDC · Solana MAINNET\n\n"+text("Desde: ","From: ")+draft.from+"\n\n"+text("Destino: ","To: ")+draft.recipient+
                    "\n\nUSDC: "+new BigDecimal(draft.units,6).toPlainString()+"\n"+text("Comisión SOL: ","SOL fee: ")+new BigDecimal(draft.fee,9).toPlainString()+
                    "\n"+text("Creación de cuenta SOL: ","Account creation SOL: ")+new BigDecimal(draft.rent,9).toPlainString()+
                    "\n\n"+text("Dinero real. La siguiente huella autoriza este envío de USDC.","Real funds. The next biometric approval authorizes this USDC transfer.");
                WalletReviewDialog.show(this,text("Revisar USDC antes de enviar","Review USDC before sending"),review,text("Confirmar con huella","Confirm with biometrics"),
                    ()->authorizeUsdc(profile,service,draft,ticket),text("Cancelar","Cancel"),()->lock());
            });
        }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch)status.setText(text("No se pudo preparar USDC. Revisa el destino, saldo USDC, SOL para gastos y operaciones pendientes. Esta solicitud no se envió.","Cannot prepare USDC. Check destination, USDC funds, SOL for costs and pending operations. This request was not sent."));});}});
    }
    void readPerpsExits(){
        NativeWalletProfiles.Profile profile=selectedProfile;if(profile==null){status.setText(text("Desbloquea primero la billetera.","Unlock the wallet first."));return;}
        String asset=perpsAsset.getSelectedItem().toString();int side=perpsSide.getSelectedItemPosition()+1;long ticket=epoch;
        pendingPerpsExits.clear();perpsExits.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,new String[0]));
        status.setText(text("Consultando solicitudes de tu posición cerrada; no se cancela nada.","Reading your closed position's requests; nothing is cancelled."));
        worker.execute(()->{try{NativePerpsCloseChain.PendingExits found=new NativePerpsCloseChain().pendingExits(profile.solanaAddress,asset,side);
            runOnUiThread(()->{if(ticket!=epoch)return;pendingPerpsExits.clear();pendingPerpsExits.addAll(found.exits);java.util.ArrayList<String> labels=new java.util.ArrayList<>();
                for(NativePerpsCancelIntent i:found.exits)labels.add((i.takeProfit?"TP":"SL")+" · "+NativePerpsReviewAmounts.usd(i.triggerPrice)+" USD · "+i.requestAddress);
                perpsExits.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,labels));status.setText(found.exits.isEmpty()?text("No se encontraron TP/SL pendientes para esta posición cerrada.","No pending TP/SL found for this closed position."):text("Selecciona una solicitud y revisa su cancelación. No se ha enviado nada.","Select one request and review its cancellation. Nothing has been sent."));});
        }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch)status.setText(text("No se pudo verificar la lista. La posición debe estar cerrada y las solicitudes deben ser TP/SL compatibles. No se canceló nada.","List could not be verified. The position must be closed and requests must be supported TP/SL. Nothing was cancelled."));});}});
    }
    void reviewPerpsCancellation(){
        NativeWalletProfiles.Profile profile=selectedProfile;if(profile==null){status.setText(text("Desbloquea primero la billetera.","Unlock the wallet first."));return;}
        int index=perpsExits.getSelectedItemPosition();if(index<0||index>=pendingPerpsExits.size()){status.setText(text("Consulta y selecciona primero un TP/SL restante.","Read and select a remaining TP/SL first."));return;}
        NativePerpsCancelIntent intent=pendingPerpsExits.get(index);
        if(!intent.payer.equals(profile.solanaAddress)||!intent.asset.equals(perpsAsset.getSelectedItem().toString())||intent.side!=perpsSide.getSelectedItemPosition()+1){status.setText(text("Cambió la cuenta o el mercado. Consulta la lista otra vez.","Account or market changed. Read the list again."));return;}
        lock();selectedProfile=profile;long ticket=epoch;NativePerpsCancelTransfers service;
        try{service=new NativePerpsCancelTransfers(this,profile);}catch(Exception failure){status.setText(text("Registro no disponible. No se cancela nada.","Storage unavailable. Nothing is cancelled."));return;}
        perpsCancelService=service;status.setText(text("Verificando cancelación y reembolso. No se firma ni envía.","Verifying cancellation and refund. Nothing is signed or sent."));
        worker.execute(()->{try{NativePerpsCancelTransfers.Draft draft=service.prepare(intent);
            runOnUiThread(()->{if(ticket!=epoch){service.invalidate();return;}try{service.requireReview(draft,()->ticket==epoch);}catch(Exception expired){service.invalidate();status.setText(text("La revisión caducó. Solicita otra.","Review expired. Request another."));return;}
                WalletReviewDialog.show(this,text("Revisar cancelación de TP/SL","Review TP/SL cancellation"),draft.review.description(es),text("Autorizar cancelación con huella","Authorize cancellation with biometrics"),()->authorizePerpsCancellation(profile,service,draft,ticket),text("Cancelar","Cancel"),()->lock());});
        }catch(Exception failure){service.invalidate();runOnUiThread(()->{if(ticket==epoch)status.setText(text("La cancelación no pudo verificarse: la solicitud o posición pudo cambiar. Consulta de nuevo. No se firmó ni envió nada.","Cancellation could not be verified: the request or position may have changed. Read it again. Nothing was signed or sent."));});}});
    }
    private void authorizePerpsCancellation(NativeWalletProfiles.Profile profile,NativePerpsCancelTransfers service,NativePerpsCancelTransfers.Draft draft,long ticket){
        if(ticket!=epoch)return;worker.execute(()->{try{service.requireReview(draft,()->ticket==epoch);HardwareWalletVault selected=new HardwareWalletVault(this,profile.ownerId,profile.vaultId);var operation=selected.prepareOpen();
            runOnUiThread(()->{if(ticket!=epoch){selected.cancel();return;}vault=selected;cancellation=new CancellationSignal();
                new BiometricPrompt.Builder(this).setTitle(text("Autorizar cancelación real de TP/SL","Authorize real TP/SL cancellation")).setSubtitle(draft.review.intent.asset+" · "+(draft.review.intent.takeProfit?"TP":"SL"))
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG).setNegativeButton(text("Cancelar","Cancel"),getMainExecutor(),(dialog,which)->lock()).build()
                    .authenticate(new BiometricPrompt.CryptoObject(operation.authenticationCipher()),cancellation,getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
                        @Override public void onAuthenticationError(int code,CharSequence reason){if(ticket==epoch)lock();}
                        @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result){if(ticket!=epoch)return;if(result.getCryptoObject()==null||result.getCryptoObject().getCipher()!=operation.authenticationCipher()){lock();return;}
                            worker.execute(()->{byte[][] signature=new byte[1][];try{if(ticket!=epoch)return;
                                operation.completeOpen(entropy->signature[0]=service.signReviewed(draft,entropy,new SolanaNativeTransfers.Signer(){public String address(byte[] input){return NativeHdWallet.addresses(input).solana;}public byte[] sign(byte[] input,byte[] message){return NativeHdWallet.signSolana(input,message);}},()->ticket==epoch));
                                String id=service.submit(draft,signature[0],()->ticket==epoch);runOnUiThread(()->{if(ticket==epoch){status.setText(text("Cancelación presentada; esperando finalización. No repitas.\n","Cancellation submitted; waiting for finalization. Do not repeat.\n")+id);pollSwapConfirmation(profile,id,ticket,0);}});
                            }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch)status.setText(text("Cancelación sin confirmar. Consulta la última operación antes de repetir; podría haberse transmitido.","Cancellation unconfirmed. Check the latest operation before retrying; it may have been broadcast."));});}
                            finally{if(signature[0]!=null)Arrays.fill(signature[0],(byte)0);service.invalidate();selected.cancel();}});
                        }
                    });
            });
        }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch){lock();status.setText(text("Autorización no disponible o revisión caducada. No se envió esta solicitud.","Authorization unavailable or review expired. This request was not sent."));}});}});
    }
    private void authorizeUsdc(NativeWalletProfiles.Profile profile,NativeUsdcTransfers service,NativeUsdcTransfers.Draft draft,long ticket){
        if(ticket!=epoch)return;
        worker.execute(()->{try{
            HardwareWalletVault selected=new HardwareWalletVault(this,profile.ownerId,profile.vaultId);var operation=selected.prepareOpen();
            runOnUiThread(()->{if(ticket!=epoch){selected.cancel();return;}vault=selected;cancellation=new CancellationSignal();
                new BiometricPrompt.Builder(this).setTitle(text("Autorizar envío real de USDC","Authorize real USDC transfer"))
                    .setSubtitle(new BigDecimal(draft.units,6).toPlainString()+" USDC · Solana")
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
                                },()->ticket==epoch));
                                String id=service.submit(draft,signature[0],()->ticket==epoch);
                                runOnUiThread(()->{if(ticket==epoch)status.setText(text("USDC presentado; falta confirmación de red. No repitas.\n","USDC submitted; network confirmation pending. Do not repeat.\n")+id);});
                            }catch(Exception failure){runOnUiThread(()->{if(ticket==epoch)status.setText(text("USDC sin confirmar. Consulta la última operación de Solana antes de repetir; podría haberse transmitido.","USDC unconfirmed. Check the latest Solana operation before retrying; it may have been broadcast."));});}
                            finally{if(signature[0]!=null)Arrays.fill(signature[0],(byte)0);selected.cancel();}});
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
                WalletReviewDialog.show(this,text("Revisar antes de enviar","Review before sending"),review,
                    text("Confirmar con huella","Confirm with biometrics"),()->authorizeSolana(profile,service,draft,ticket),text("Cancelar","Cancel"),()->lock());
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
    /** Read-only follow-up of exactly the submitted signature. Never re-sign or resend. */
    void pollSwapConfirmation(NativeWalletProfiles.Profile profile,String id,long ticket,int attempt){
        if(ticket!=epoch || isFinishing() || isDestroyed())return;
        status.postDelayed(()->{
            if(ticket!=epoch || isFinishing() || isDestroyed())return;
            worker.execute(()->{
                if(ticket!=epoch)return;
                try{
                    var record=confirmationReader.latest(profile);
                    if(record==null || !id.equals(record.transactionId))throw new IllegalStateException("Confirmation record mismatch");
                    final boolean fullClose=record.perps!=null&&"FULL_CLOSE".equals(record.perps.operation);
                    final boolean cancelledExit=record.perps!=null&&"CANCEL_TPSL".equals(record.perps.operation);
                    boolean verifiedClose=false;
                    if(fullClose&&record.phase==NativeTransferJournal.Phase.CONFIRMED){
                        try{verifiedClose=closePositionReader.closed(profile,record.perps.asset,record.perps.side,record.perps.minimumSlot);}catch(Exception unavailable){/* Never treat missing or stale state as an empty position. */}
                    }
                    final boolean positionClosed=verifiedClose;
                    boolean absent=false;if(cancelledExit&&record.phase==NativeTransferJournal.Phase.CONFIRMED)try{absent=cancellationReader.absent(profile,record.perps);}catch(Exception unavailable){/* No finality/absence proof: no success claim. */}
                    final boolean cancellationGone=absent;
                    runOnUiThread(()->{
                        if(ticket!=epoch)return;
                        String message;
                        if(record.phase==NativeTransferJournal.Phase.CONFIRMED&&cancelledExit)message=cancellationGone?text("Cancelación finalizada y TP/SL eliminado de la red. Consulta la lista para ver los restantes.","Cancellation finalized and TP/SL removed on chain. Read the list to check remaining requests."):text("La firma finalizó, pero falta verificar la ausencia del TP/SL. Consulta la última operación; no repitas automáticamente.","Signature finalized, but TP/SL absence is not verified yet. Check the latest operation; do not retry automatically.");
                        else if(record.phase==NativeTransferJournal.Phase.CONFIRMED&&fullClose)message=positionClosed?
                            text("Cierre confirmado y posición cerrada en la red. La conversión a USDC y la limpieza de TP/SL, si corresponden, son operaciones separadas.","Close confirmed and position closed on chain. USDC conversion and TP/SL cleanup, if applicable, are separate operations."):
                            text("La firma aparece confirmada, pero no se ha podido comprobar que la posición esté cerrada. Consulta su estado; no repitas automáticamente.","The signature is confirmed, but the position could not be verified closed. Check its state; do not retry automatically.");
                        else if(record.phase==NativeTransferJournal.Phase.CONFIRMED)message=text("Operación confirmada por la red.","Operation confirmed by the network.");
                        else if(record.phase==NativeTransferJournal.Phase.FAILED)message=text("La red rechazó la operación. Puede haberse cobrado la comisión de red.","The network rejected the operation. A network fee may have been charged.");
                        else message=text("Confirmación pendiente. No repitas la operación. Puedes consultar la última operación de Solana.","Confirmation pending. Do not repeat the operation. You can check the latest Solana operation.");
                        status.setText(message+"\n"+id);
                        if(record.pending() && attempt<5)pollSwapConfirmation(profile,id,ticket,attempt+1);
                    });
                }catch(Exception unavailable){
                    runOnUiThread(()->{if(ticket==epoch){status.setText(text("No se pudo consultar la confirmación. La operación podría haberse enviado: no repitas. Consulta la última operación de Solana.","Confirmation unavailable. The operation may have been submitted: do not repeat it. Check the latest Solana operation.")+"\n"+id);}});
                }
            });
        },2000);
    }
    private void checkSolana(){
        NativeWalletProfiles.Profile profile=selectedProfile;if(profile==null){status.setText(text("Desbloquea primero la billetera.","Unlock the wallet first."));return;}
        long ticket=epoch;worker.execute(()->{try{
            var record=new SolanaNativeTransfers(this,profile).checkLatest();
            String result=record==null?text("No hay envíos registrados.","No recorded transfers."):record.phase.name()+"\n"+record.transactionId;
            if(record!=null&&record.perps!=null&&"CANCEL_TPSL".equals(record.perps.operation)&&record.phase==NativeTransferJournal.Phase.CONFIRMED){
                boolean absent=false;try{absent=cancellationReader.absent(profile,record.perps);}catch(Exception unavailable){}
                result=(absent?text("Cancelación finalizada; solicitud y cuenta de tokens eliminadas.","Cancellation finalized; request and token account removed."):text("Finalización recibida, pero falta verificar la ausencia. No repitas automáticamente.","Finalization received, but absence is not verified. Do not retry automatically."))+"\n"+record.transactionId;
            }
            final String display=result;
            runOnUiThread(()->{if(ticket==epoch)status.setText(display);});
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
                WalletReviewDialog.show(this,text("Revisar antes de enviar","Review before sending"),review,
                    text("Confirmar con huella","Confirm with biometrics"),()->authorizeBnb(profile,service,draft,ticket),text("Cancelar","Cancel"),()->lock());
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
        if(ticket!=epoch)return;
        try{
            var token=new NativeSolanaTokens().readUsdc(profile.solanaAddress);
            result.append("USDC · Solana: ").append(token.decimalAmount()).append("\n");
            if(token.frozen.signum()>0)result.append(text("USDC congelado: ","Frozen USDC: ")).append(new BigDecimal(token.frozen,6).toPlainString()).append("\n");
            if(token.hasDelegatedAccounts)result.append(text("USDC: hay cuentas con permisos delegados; revisar antes de operar.\n","USDC: some accounts have delegated permissions; review before trading.\n"));
        }catch(Exception failure){result.append(text("USDC · Solana: saldo no disponible\n","USDC · Solana: balance unavailable\n"));}
        result.append(text("Consulta puntual; no se han enviado fondos.","Point-in-time lookup; no funds were sent."));
        runOnUiThread(()->{if(ticket==epoch)status.setText(result.toString());});
    }
    private void recoveryError(long ticket,Throwable failure){
        final String code=WalletRecoveryFailure.code(failure);
        runOnUiThread(()->{if(ticket!=epoch)return;lock();
            String message;
            if(code.equals("BACKUP_AUTH"))message=text("El archivo y la contraseña no se pudieron verificar. Puede ser otra contraseña o un archivo alterado. Conserva el original.","The file and password could not be verified. The password may differ or the file may be altered. Keep the original.");
            else if(code.equals("KEY_INVALIDATED"))message=text("Android informa que la clave protegida ya no es válida. Recupera con el respaldo original; no borres la app.","Android reports the protected key is no longer valid. Recover with the original backup; do not delete the app.");
            else if(code.equals("BACKUP_STORAGE"))message=text("No se pudo acceder al almacenamiento del respaldo o de la billetera. Conserva tus archivos.","Backup or wallet storage could not be accessed. Keep your files.");
            else message=text("No se pudo completar la recuperación. No se ha confirmado un cambio de huella. Conserva el respaldo y comunica este código.","Recovery could not be completed. A biometric change has not been confirmed. Keep your backup and report this code.");
            status.setText(message+" ["+code+"]");
        });
    }
    private void error(long ticket){runOnUiThread(()->{if(ticket!=epoch)return;lock();status.setText(text("No se pudo verificar esta operación. Esto no confirma un cambio de huella. Conserva tu respaldo; no se ha enviado dinero.","This operation could not be verified. This does not confirm a biometric change. Keep your backup; no money was sent."));});}
    private void lock(){epoch++;if(accessCheckStatus!=null)accessCheckStatus.setText("");NativePerpsConversionTransfers conversion=perpsConversionService;perpsConversionService=null;if(conversion!=null)conversion.invalidate();NativePerpsTransfers previous=perpsService;perpsService=null;if(previous!=null)previous.invalidate();NativePerpsCloseTransfers close=perpsCloseService;perpsCloseService=null;if(close!=null)close.invalidate();NativePerpsCancelTransfers cancel=perpsCancelService;perpsCancelService=null;if(cancel!=null)cancel.invalidate();pendingPerpsExits.clear();if(perpsExits!=null)perpsExits.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,new String[0]));selectedProfile=null;if(cancellation!=null)cancellation.cancel();cancellation=null;if(vault!=null)vault.cancel();vault=null;if(enrollment!=null)enrollment.cancel();if(password!=null)password.setText("");if(passwordRepeat!=null)passwordRepeat.setText("");if(addresses!=null)addresses.setText("");if(status!=null)status.setText(text("Billetera bloqueada.","Wallet locked."));}
    @Override protected void onStop(){if(seedDialog!=null){seedDialog.dismiss();seedDialog=null;}lock();super.onStop();}
    @Override protected void onDestroy(){lock();worker.shutdownNow();super.onDestroy();}
}
