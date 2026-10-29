# Discover visual refresh — October 28, 2026 (America/New_York)

Published source c21343c as production dpl_A5mRufbe8Y5DiNkL3Dx9T4C2k6Df.
Candidate source checked before promotion. Public old-version URL verified after
promotion: https://www.jamddmaj.com/discover.html?version=1.37.69.

Visible changes: new gradient hero heading, release pill, prominent 50-message
allowance, guided entry cards, mobile spacing and reduced-motion-safe entrance.
Removed the misleading zero-private-keys statistic (dedicated bot custody is
separate). No operations or account limits were changed. New copy is Spanish and
English with explicit English fallback for untranslated additions in other locales.

Two Discover unit tests passed. Browser checks passed at 390 and 1440 px with
local candidate files; public mobile checks confirmed updated hero, three cards,
no horizontal overflow, language switch, zero page errors. Tour next-step tested.
Bounded production error-log query returned zero records. Main app returned 200.

Android session persistence changes remain uncommitted/unpublished and were not
included in this release. Build script now bundles web-trial-ui; the exported
committed source for that module is still the previous production implementation.
