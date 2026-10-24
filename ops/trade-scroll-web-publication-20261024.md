# Trade order-book scroll correction — web publication

- URL: https://www.jamddmaj.com
- Target: production; status READY; framework Other.
- Source commit: `0ac7ff0`.
- Deployment: `dpl_BRkY4DJ9TDGZtvxVwAvtiu2m9ivD`.
- Candidate: https://jamd-dmaj-hsysto12r-jamd-dmaj-s-projects.vercel.app
- Build output completed in 7 seconds.

The Trade-specific sticky position was replaced by normal document flow. No
Futures positioning, accounts, balances, execution configuration or transaction
logic changed. Source was exported from the committed tree, excluding unrelated
dirty files, credentials and native folders. Existing project/team were verified
before staging. The protected candidate module was checked using existing CLI
authentication, then the same production build was promoted unchanged.

Five focused tests passed: styles, browser scroll/overlap, browser module graph
and English/Spanish terminal navigation. A real isolated Edge browser then
checked the **public** page at viewport widths 430 and 1365: computed book
position `static`, book top after page scroll approximately -100 pixels,
purchase form uncovered, Futures position still `static`, zero module errors,
zero financial requests. No user browser profile or wallet was accessed.

This publishes the web correction only. The signed Android 1.38.1 release has
not been rebuilt or retagged for this CSS change. Reloading the web page fetches
the new module; uninstalling or deleting wallet data is neither needed nor advised.
