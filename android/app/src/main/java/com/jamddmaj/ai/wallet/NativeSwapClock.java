package com.jamddmaj.ai.wallet;

import java.util.function.LongSupplier;

/** One quote session, anchored only to the fixed HTTPS response's Date header.
 * Never uses the phone's adjustable calendar clock. The upper-bound estimate
 * subtracts uncertainty from quote lifetime, never adds extra lifetime.
 */
final class NativeSwapClock implements NativeSwapService.Clock {
    private final LongSupplier monotonic;
    private boolean anchored;
    private long receiptElapsed, receiptUpperTime;
    NativeSwapClock(LongSupplier monotonic) {
        if(monotonic==null)throw new IllegalArgumentException("Missing monotonic clock");
        this.monotonic=monotonic;
    }
    synchronized void anchor(long httpsDate,long requestStarted,String age) {
        if(anchored || httpsDate<=0 || (age!=null && !"0".equals(age.trim())))throw invalid();
        long receipt=elapsed(),duration;
        try { duration=Math.subtractExact(receipt,requestStarted); }
        catch(ArithmeticException overflow) { throw invalid(); }
        if(requestStarted<0 || duration<0 || duration>10000)throw invalid();
        long upper;
        try {
            // HTTP dates have one-second precision. Charge the full request
            // duration as well, so network delay cannot extend the quote.
            upper=Math.addExact(Math.addExact(httpsDate,1000),duration);
        } catch(ArithmeticException overflow) { throw invalid(); }
        receiptElapsed=receipt;receiptUpperTime=upper;anchored=true;
    }
    public long elapsed() { return monotonic.getAsLong(); }
    public synchronized long wall() {
        if(!anchored)throw invalid();
        try {
            long delta=Math.subtractExact(elapsed(),receiptElapsed);
            if(delta<0)throw invalid();
            return Math.addExact(receiptUpperTime,delta);
        } catch(ArithmeticException overflow) { throw invalid(); }
    }
    private static NativeSwapPreparation.TimeMismatch invalid() { return new NativeSwapPreparation.TimeMismatch(); }
}
