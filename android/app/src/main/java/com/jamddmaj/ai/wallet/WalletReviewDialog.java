package com.jamddmaj.ai.wallet;

import android.app.AlertDialog;
import android.content.Context;
import android.view.MotionEvent;
import android.view.WindowManager;

/** Dialogs have separate windows: Activity touch filtering alone does not protect confirmation. */
final class WalletReviewDialog extends AlertDialog {
    WalletReviewDialog(Context context){super(context);}
    @Override public boolean dispatchTouchEvent(MotionEvent event){
        if((event.getFlags()&(MotionEvent.FLAG_WINDOW_IS_OBSCURED|MotionEvent.FLAG_WINDOW_IS_PARTIALLY_OBSCURED))!=0)return false;
        return super.dispatchTouchEvent(event);
    }
    static void show(Context context,String title,String message,String confirmLabel,Runnable confirm,String cancelLabel,Runnable cancel){
        WalletReviewDialog dialog=new WalletReviewDialog(context);dialog.setTitle(title);dialog.setMessage(message);
        dialog.setButton(BUTTON_POSITIVE,confirmLabel,(window,which)->confirm.run());
        dialog.setButton(BUTTON_NEGATIVE,cancelLabel,(window,which)->cancel.run());
        dialog.setOnCancelListener(window->cancel.run());
        dialog.show();dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
}
