package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import android.text.InputType;
import java.util.Arrays;

/** Native-only two-step phrase display and transcription; never exports to clipboard or WebView. */
final class SeedCreationDialog extends WalletReviewDialog {
    interface Confirmed { void accept(byte[] encrypted,char[] password); }
    private char[] phrase,password;
    private byte[] encrypted;
    private TextView words;
    private EditText confirmation;
    private boolean verifying;
    SeedCreationDialog(Context context,char[] phrase,byte[] encrypted,char[] password,boolean es,Confirmed confirmed){
        super(context);this.phrase=phrase.clone();this.encrypted=encrypted.clone();this.password=password.clone();
        setTitle(es?"Nueva billetera · 24 palabras":"New wallet · 24 words");
        LinearLayout content=new LinearLayout(context);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(28,20,28,20);
        TextView warning=new TextView(context);warning.setText(es?"Anota estas palabras en orden y guárdalas fuera de línea. Quien las tenga controla tu dinero. No las compartas ni las envíes al chat.":"Write these words in order and store them offline. Anyone with them controls your funds. Never share them or send them to chat.");content.addView(warning);
        words=new TextView(context);words.setText(new String(phrase));words.setSaveEnabled(false);words.setTextIsSelectable(false);words.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);content.addView(words);
        confirmation=new EditText(context);confirmation.setSaveEnabled(false);confirmation.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);confirmation.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);confirmation.setHint(es?"Escribe las 24 palabras en orden":"Enter all 24 words in order");confirmation.setVisibility(View.GONE);content.addView(confirmation);
        ScrollView scroll=new ScrollView(context);scroll.addView(content);setView(scroll);setButton(BUTTON_POSITIVE,es?"Ya las anoté":"I wrote them down",(d,w)->{});setButton(BUTTON_NEGATIVE,es?"Cancelar":"Cancel",(d,w)->dismiss());
        setOnDismissListener(d->clear());
        setOnShowListener(d->getButton(BUTTON_POSITIVE).setOnClickListener(v->{
            if(!verifying){verifying=true;words.setText("");words.setVisibility(View.GONE);confirmation.setVisibility(View.VISIBLE);getButton(BUTTON_POSITIVE).setText(es?"Verificar y proteger":"Verify and protect");return;}
            char[] typed=confirmation.getText().toString().trim().replaceAll("\\s+"," ").toCharArray();
            boolean matches=Arrays.equals(this.phrase,typed);Arrays.fill(typed,'\0');
            if(!matches){confirmation.setError(es?"Las palabras no coinciden":"Words do not match");return;}
            byte[] copy=this.encrypted.clone();char[] pass=this.password.clone();
            try{confirmed.accept(copy,pass);}finally{Arrays.fill(copy,(byte)0);Arrays.fill(pass,'\0');dismiss();}
        }));
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
    private void clear(){words.setText("");confirmation.setText("");if(phrase!=null)Arrays.fill(phrase,'\0');if(password!=null)Arrays.fill(password,'\0');if(encrypted!=null)Arrays.fill(encrypted,(byte)0);phrase=null;password=null;encrypted=null;}
}
