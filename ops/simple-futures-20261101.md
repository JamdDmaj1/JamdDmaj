# Simpler manual Futures · web 1.38.19

User requested an exchange-like flow without repeated configuration/read buttons.
References inspected: Bitget support article 12560603818282 (opening/closing,
margin/leverage grouping), Binance support 360034946672 (leverage controls,
secondary default settings). No unsupported exchange order types were added.

- Long/Short reads selected wallet manual policy automatically. Existing limits
  are reused; missing limits open account protection in the same screen.
- No guessed/default limits, automatic policy save, account activation or trade.
- Policy change still requires explicit save approval. Only order + fee approval
  are combined in one unchecked, clearly labelled confirmation; server receives
  both explicit consent flags only after this user action.
- Review displays wallet, direction, leverage, margin, fee, combined USDC total,
  combined SOL network/rent, reference and TP/SL in separate labelled rows.
  Fee recipient and account limits remain available in review details.
- Real compiled DOM fixture verifies desktop/mobile, one entry consent and exact
  10.02 USDC total for 10 margin + 0.02 fee. Financial network calls blocked.
- Full suite: 1318 tests, 1299 passed, 19 skipped, zero failures. Additional
  auto-read/missing-setup and unchanged paused/account ownership tests pass.
- Discover HTML/JS updated; CSS and tour reviewed, no layout change needed.
- Source commit a9c1911; staged production dpl_EmZGwsPDnGX7ZAk3QUkRbuL2Q4dh,
  https://jamd-dmaj-p42jbiu54-jamd-dmaj-s-projects.vercel.app.
  Candidate module equals tested local build after only dependency path comment
  normalization. Promoted, then public status/module/Discover content verified.
  Initial public status briefly returned 1.38.18 during alias propagation;
  subsequent no-store read confirmed 1.38.19. No extra redeploy was made.
- No server change, real signature, transfer, bot activation or Android APK
  publication. Real signed-in customer review is still not independently verified.
