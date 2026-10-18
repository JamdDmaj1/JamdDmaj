package com.jamddmaj.ai.wallet;

import android.content.Intent;

/** Validated form navigation only: never accepts a wallet key, wire or signature. */
public final class NativePerpsNavigation {
    public static void putDraft(Intent screen,String asset,String side,String margin,String leverage,String price,String sl,String tp){
        parse(asset,side,margin,leverage,price,sl,tp);
        screen.putExtra("perps-asset",asset).putExtra("perps-side",side).putExtra("perps-margin",margin)
            .putExtra("perps-leverage",leverage).putExtra("perps-price",price);
        if(sl!=null&&!sl.isEmpty())screen.putExtra("perps-sl",sl);
        if(tp!=null&&!tp.isEmpty())screen.putExtra("perps-tp",tp);
    }
    static NativePerpsOrderIntent readDraft(Intent screen){
        return parse(screen.getStringExtra("perps-asset"),screen.getStringExtra("perps-side"),screen.getStringExtra("perps-margin"),
            screen.getStringExtra("perps-leverage"),screen.getStringExtra("perps-price"),screen.getStringExtra("perps-sl"),screen.getStringExtra("perps-tp"));
    }
    private static NativePerpsOrderIntent parse(String asset,String side,String margin,String leverage,String price,String sl,String tp){
        if(!("LONG".equals(side)||"SHORT".equals(side)))throw new IllegalArgumentException("Invalid perps direction");
        return new NativePerpsOrderIntent(asset,"LONG".equals(side)?1:2,margin,leverage,50,price,
            sl==null||sl.isEmpty()?null:sl,tp==null||tp.isEmpty()?null:tp);
    }
    private NativePerpsNavigation(){}
}
