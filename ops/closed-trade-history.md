# Closed manual trade history — implementation candidate

Published with web 1.38.25 and the entry-freshness server release. See
`entry-freshness-fix-20261107.md` for deployment evidence and limitations.

Authenticated `botManualHistory` is wallet-owner bound and read-only. It
returns up to 50 native manual closes with verified FIRST_LEG_FINALIZED payout
records, revalidated through the existing completion snapshot validator.
Uncertain sends, unsigned reviews and cancelled closes are excluded.
PREPARED with finalized payout is explicitly CLOSED_PENDING_ACCOUNTING;
COMPLETED requires the existing canonical completion record and closed parents.
The history read never invokes recovery, signing, broadcast, account-policy
updates or reservation release. All rows are read in one consistent snapshot.

UI includes asset, side, actual on-chain close time, actual received USDC
(or conversion pending), accounting state and a fixed Solscan transaction link.
Returned principal is not labelled profit. Net per-order PnL remains null;
daily account loss is never misused as an individual trade result.
Changing the selected wallet clears old rows and invalidates late reads.
Manual close/recovery responses refresh this read-only view, never retry trades.

Verified locally: web build; compiled desktop/mobile browser UI with mocked
financial transport; API ownership/no-store/extra-field checks; client rejects
uncertain rows, fabricated PnL, future times, unsafe units and malformed links;
native coordinator fixtures validate finalized and completed journal history.
The broader native/API/client suite passed 103 cases, skipped one optional
browser-journal case. Targeted coordinator rerun passed five cases.

Read-only server aggregate observed one COMPLETED/FIRST_LEG_FINALIZED close.
No financial send or state mutation was performed for this feature.

Discover HTML, JS, CSS and tour CSS reviewed: keep the public descriptions
accurate for the shipped endpoint and browser module. Announce verified closed
history, not net realised PnL or additional executable assets. APK unchanged.

The existing real COMPLETED close was revalidated through the history snapshot
reader on a private read-only-source database copy: one finalized, completed
history item; no financial send or live database write.
