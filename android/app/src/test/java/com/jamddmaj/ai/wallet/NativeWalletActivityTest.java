package com.jamddmaj.ai.wallet;

import android.content.ComponentName;
import android.content.pm.ActivityInfo;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.MotionEvent;
import android.widget.EditText;
import java.util.ArrayList;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativeWalletActivityTest {
    @Test public void validatedPerpsDraftPrefillsButNeverStartsReviewOrAuthorization(){
        var app=org.robolectric.RuntimeEnvironment.getApplication();
        var intent=new android.content.Intent(app,NativeWalletActivity.class).putExtra("wallet-navigation","perps");
        NativePerpsNavigation.putDraft(intent,"SOL","SHORT","10.123456","2.5","105","110","95");
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class,intent).create()){
            var activity=controller.get();android.view.ViewGroup form=activity.getWindow().getDecorView().findViewWithTag("native-perps-form");
            ArrayList<EditText> inputs=new ArrayList<>();fields(form,inputs);
            assertEquals("10.123456",inputs.get(0).getText().toString());assertEquals("2.5",inputs.get(1).getText().toString());
            assertEquals("105.000000",inputs.get(2).getText().toString());assertEquals("110.000000",inputs.get(3).getText().toString());
            assertEquals("95.000000",inputs.get(4).getText().toString());
            assertNull(org.robolectric.shadows.ShadowAlertDialog.getLatestAlertDialog());
            assertNull(org.robolectric.Shadows.shadowOf(activity).getNextStartedActivity());
        }
        assertThrows(IllegalArgumentException.class,()->NativePerpsNavigation.putDraft(new android.content.Intent(),"SOL","LONG","9","2","105",null,null));
        assertThrows(IllegalArgumentException.class,()->NativePerpsNavigation.putDraft(new android.content.Intent(),"ZEC","LONG","10","2","105",null,null));
    }
    @Test public void perpsNavigationRequiresWalletAndNeverImportsWebTransactionArguments(){
        var app=org.robolectric.RuntimeEnvironment.getApplication();
        var intent=new android.content.Intent(app,NativeWalletActivity.class).putExtra("wallet-navigation","perps")
            .putExtra("margin","999").putExtra("serializedTxBase64","untrusted");
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class,intent).create()){
            var activity=controller.get();
            android.view.ViewGroup form=activity.getWindow().getDecorView().findViewWithTag("native-perps-form");
            assertEquals(View.VISIBLE,form.getVisibility());
            ArrayList<EditText> inputs=new ArrayList<>();fields(form,inputs);
            assertEquals(5,inputs.size());for(EditText input:inputs)assertEquals("",input.getText().toString());
            activity.reviewPerps();
            assertNull(org.robolectric.Shadows.shadowOf(activity).getNextStartedActivity());
            assertNull(org.robolectric.shadows.ShadowAlertDialog.getLatestAlertDialog());
        }
    }
    @Test public void swapNavigationOnlyOpensFormWithoutAmountOrAuthorization(){
        var app=org.robolectric.RuntimeEnvironment.getApplication();
        var intent=new android.content.Intent(app,NativeWalletActivity.class).putExtra("wallet-navigation","swap");
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class,intent).create()){
            ArrayList<EditText> inputs=new ArrayList<>();fields(controller.get().getWindow().getDecorView(),inputs);
            assertEquals(View.VISIBLE,((View)inputs.get(7).getParent()).getVisibility());
            assertEquals("",inputs.get(9).getText().toString());
            assertNull(org.robolectric.Shadows.shadowOf(controller.get()).getNextStartedActivity());
        }
    }
    @Test public void swapAmountExplicitlyNamesTokenAndClearsWhenPaymentTokenChanges(){
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class).create()){
            var activity=controller.get();ArrayList<EditText> inputs=new ArrayList<>();fields(activity.getWindow().getDecorView(),inputs);
            android.widget.TextView unit=activity.getWindow().getDecorView().findViewWithTag("swap-amount-unit");
            assertTrue(unit.getText().toString().contains("20 SOL"));
            inputs.get(9).setText("20");inputs.get(7).setText(NativeSolanaTokens.USDC);
            assertEquals("",inputs.get(9).getText().toString());
            assertTrue(unit.getText().toString().contains("USDC"));
            assertFalse(unit.getText().toString().contains("20 SOL"));
        }
    }
    @Test public void confirmationPollingDoesNotRunAfterLockOrExit(){
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class).create().start()){
            var activity=controller.get();int[] reads={0};
            activity.confirmationReader=profile->{reads[0]++;throw new AssertionError("No RPC after lock");};
            activity.pollSwapConfirmation(null,"fixture-signature",0,0);
            controller.stop();
            org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofSeconds(3));
            assertEquals(0,reads[0]);
            activity.finish();activity.pollSwapConfirmation(null,"fixture-signature",1,0);
            org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofSeconds(3));
            assertEquals(0,reads[0]);
        }
    }
    @Test public void appHeaderReturnsToAssetsAndClearsSensitiveInputsWithoutOpeningAnotherActivity(){
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class).create()){
            var activity=controller.get();ArrayList<EditText> inputs=new ArrayList<>();fields(activity.getWindow().getDecorView(),inputs);
            assertNotNull(activity.getWindow().getDecorView().findViewWithTag("native-wallet-shell"));
            inputs.get(1).setText("temporary password");
            View back=activity.getWindow().getDecorView().findViewWithTag("wallet-back-to-assets");
            assertNotNull(back);back.performClick();assertTrue(activity.isFinishing());
            assertEquals("",inputs.get(1).getText().toString());
            assertNull(org.robolectric.Shadows.shadowOf(activity).getNextStartedActivity());
        }
    }
    @Test public void recoveryOpensBackupFormAndClearsOldPasswords(){
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class).create()){
            var activity=controller.get();ArrayList<EditText> inputs=new ArrayList<>();fields(activity.getWindow().getDecorView(),inputs);
            assertEquals(View.GONE,((View)inputs.get(0).getParent()).getVisibility());
            inputs.get(1).setText("old password");inputs.get(2).setText("old password");
            activity.showRecoveryForm();
            assertEquals(View.VISIBLE,((View)inputs.get(0).getParent()).getVisibility());
            assertEquals(View.GONE,((View)inputs.get(3).getParent()).getVisibility());
            assertEquals(View.GONE,((View)inputs.get(5).getParent()).getVisibility());
            assertEquals("",inputs.get(1).getText().toString());assertEquals("",inputs.get(2).getText().toString());
        }
    }
    @Test public void obscuredTouchesCannotConfirmWalletActions(){
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class).create()){
            MotionEvent.PointerProperties pointer=new MotionEvent.PointerProperties();pointer.id=0;pointer.toolType=MotionEvent.TOOL_TYPE_FINGER;
            MotionEvent.PointerCoords coords=new MotionEvent.PointerCoords();coords.x=50;coords.y=50;coords.pressure=1;coords.size=1;
            for(int flags:new int[]{MotionEvent.FLAG_WINDOW_IS_OBSCURED,MotionEvent.FLAG_WINDOW_IS_PARTIALLY_OBSCURED}){
                MotionEvent event=MotionEvent.obtain(1,1,MotionEvent.ACTION_DOWN,1,new MotionEvent.PointerProperties[]{pointer},new MotionEvent.PointerCoords[]{coords},0,0,1,1,0,0,0,flags);
                try{assertFalse(controller.get().dispatchTouchEvent(event));assertFalse(new WalletReviewDialog(controller.get()).dispatchTouchEvent(event));}finally{event.recycle();}
            }
        }
    }
    private void fields(View view,ArrayList<EditText> result){
        if(view instanceof EditText)result.add((EditText)view);
        if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++)fields(group.getChildAt(i),result);}
    }
    @Test public void nativeScreenIsPrivateAndSeparateFromWebProcess() throws Exception {
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class).create()){
            var activity=controller.get();
            assertNotEquals(0,activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE);
            ActivityInfo info=activity.getPackageManager().getActivityInfo(new ComponentName(activity,NativeWalletActivity.class),0);
            assertFalse(info.exported);
            assertTrue(info.processName.endsWith(":native_wallet"));
        }
    }
    @Test public void backgroundClearsPasswordsAndDisablesSavedFieldState(){
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class).create().start()){
            var activity=controller.get();ArrayList<EditText> inputs=new ArrayList<>();fields(activity.getWindow().getDecorView(),inputs);
            assertEquals(17,inputs.size());
            for(EditText field:inputs){assertFalse(field.isSaveEnabled());assertEquals(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS,field.getImportantForAutofill());}
            inputs.get(1).setText("public test password");inputs.get(2).setText("public test password");
            controller.stop();
            assertEquals("",inputs.get(1).getText().toString());assertEquals("",inputs.get(2).getText().toString());
        }
    }
    @Test public void swapFormUsesMintAddressesAndCannotPrepareWhileLocked(){
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class).create()){
            var activity=controller.get();ArrayList<EditText> inputs=new ArrayList<>();fields(activity.getWindow().getDecorView(),inputs);
            assertEquals(NativeSwapSetup.SOL,inputs.get(7).getText().toString());
            assertEquals(NativeSolanaTokens.USDC,inputs.get(8).getText().toString());
            assertEquals("",inputs.get(9).getText().toString());
            assertEquals(View.GONE,((View)inputs.get(7).getParent()).getVisibility());
            activity.reviewSwap();
            activity.reviewUsdc();
            assertNull(org.robolectric.shadows.ShadowAlertDialog.getLatestAlertDialog());
        }
    }
}
