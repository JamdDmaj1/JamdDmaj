package com.jamddmaj.ai.wallet;
import android.app.Activity;
import android.app.AlertDialog;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.EditText;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import android.os.Looper;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class) @Config(sdk=30)
public class SeedCreationDialogTest {
    // Public fixture only: never a funded wallet.
    private final String fixture="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";
    private EditText input(View v){if(v instanceof EditText)return (EditText)v;if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){EditText found=input(((ViewGroup)v).getChildAt(i));if(found!=null)return found;}return null;}
    @Test public void requiresHiddenPhraseTranscriptionAndClearsInput(){
        try(var controller=Robolectric.buildActivity(Activity.class).setup()){
            int[] calls={0};SeedCreationDialog dialog=new SeedCreationDialog(controller.get(),fixture.toCharArray(),new byte[]{1},"public-fixture-password".toCharArray(),true,(b,p)->{calls[0]++;assertEquals(1,b[0]);});dialog.show();
            Shadows.shadowOf(Looper.getMainLooper()).idle();
            assertNotEquals(0,dialog.getWindow().getAttributes().flags&WindowManager.LayoutParams.FLAG_SECURE);
            EditText field=input(dialog.getWindow().getDecorView());assertFalse(field.isSaveEnabled());assertEquals(View.GONE,field.getVisibility());
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick();assertEquals(View.VISIBLE,field.getVisibility());
            field.setText("wrong");dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick();assertEquals(0,calls[0]);
            field.setText(fixture);dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick();Shadows.shadowOf(Looper.getMainLooper()).idle();assertEquals(1,calls[0]);assertEquals("",field.getText().toString());
        }
    }
}
