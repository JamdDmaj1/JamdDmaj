# Session recovery — 1.38.13

Web access previously lived only in sessionStorage. Android encrypted recovery
previously ran only from the main chat entry, not direct Finance entry.

The browser now keeps a Secure, HttpOnly, SameSite=Strict, host-only cookie.
Same-origin POST recovery verifies the existing server session and preserves its
remaining lifetime; it does not issue or extend access. Android retains encrypted
Keystore storage and permits recovery on the exact trusted Finance pathname.
Both entry points wait for recovery before checking first-visit access.

Independent device sessions remain separate. Transient failures preserve access;
a slow recovery cannot overwrite a newer sign-in. No wallet keys, financial
permissions, bot settings or funds are changed.

Existing browser sessions may require one Google sign-in after publication to
initialize persistence. Expired/revoked access still needs sign-in. Closing all
private windows discards private cookies. This is not permanent authentication.

Verification before release: 1,219 tests passed, 19 skipped, zero failed. Real
Edge browser with synthetic credentials verified HttpOnly protection, closing
the page, reopening Finance, recovery and absence of localStorage credentials.
Actual phone close/reopen verification remains user-dependent.

Discover HTML and JS updated with recovery availability and limitations. Reviewed
Discover CSS and tour CSS: no visual changes needed for this authentication fix.
Publication/build receipts will be added after verification.
