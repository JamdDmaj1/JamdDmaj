package com.jamddmaj.ai.wallet;

import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.view.View;
import android.widget.*;

/** App-consistent native styling; never moves wallet secrets into the WebView. */
final class NativeWalletStyle {
    static final int BACKGROUND=0xff090d19, CARD=0xff111b2e, BORDER=0xff2b3951;
    static final int TEXT=0xffeef2ff, MUTED=0xffa4b2ca, ACCENT=0xff9562fa;
    static int dp(View view,int value){return Math.round(value*view.getResources().getDisplayMetrics().density);}
    static GradientDrawable box(View view,int color){
        GradientDrawable background=new GradientDrawable();background.setColor(color);
        background.setCornerRadius(dp(view,14));background.setStroke(dp(view,1),BORDER);return background;
    }
    static void button(Button button){
        button.setAllCaps(false);button.setTextColor(TEXT);button.setTextSize(15);
        button.setTypeface(Typeface.DEFAULT,Typeface.BOLD);button.setMinHeight(dp(button,50));
        button.setPadding(dp(button,14),dp(button,10),dp(button,14),dp(button,10));
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(0x449562fa),box(button,CARD),null));
        LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,-2);
        params.topMargin=dp(button,8);params.bottomMargin=dp(button,4);button.setLayoutParams(params);
    }
    static void field(EditText field){
        field.setTextColor(TEXT);field.setHintTextColor(MUTED);field.setTextSize(16);
        field.setBackground(box(field,BACKGROUND));field.setMinHeight(dp(field,54));
        field.setPadding(dp(field,14),dp(field,12),dp(field,14),dp(field,12));
        LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,-2);
        params.topMargin=dp(field,8);params.bottomMargin=dp(field,8);field.setLayoutParams(params);
    }
    static void label(TextView label,int size){
        label.setTextColor(size>=18?TEXT:MUTED);label.setTextSize(size);
        label.setPadding(0,dp(label,6),0,dp(label,8));
        if(size>=18)label.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
    }
    private NativeWalletStyle(){}
}
