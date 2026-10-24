# New conversation header correction — web

- URL: https://www.jamddmaj.com
- Target production, status READY, framework Other.
- Source: `a6ef8ff`; deployment `dpl_9CZrFuLX7p3kqYREwKPsZd4qGLZs`.
- Candidate: https://jamd-dmaj-qeasclg90-jamd-dmaj-s-projects.vercel.app
- Build output completed in 7 seconds. Existing team/project verified first;
  committed source exported cleanly, protected candidate checked through the
  existing CLI session, then that same build promoted without rebuilding.

Reproduced the reported public failure: clicking New conversation focused the
composer and scrolled the clipped `.app` shell to 164 pixels, moving the header
top to -149 pixels. The controls were outside the viewport, not removed.

The shared newChat handler now focuses with `preventScroll:true`, preserving
keyboard focus without moving the shell. Local tests passed a static contract
and repeated actual-browser clicks at 1365x660, 1365x900 and 430x820. Browser
contexts were isolated and never signed in or sent a chat request.

Post-promotion **public-page** tests passed three consecutive new conversations
at 1365x660 and 430x820: header remained visible, shell/main scroll positions
unchanged, composer still focused. No conversation-store clearing, authentication,
trading, wallet or server-configuration behavior was changed. Android APK 1.38.1
was not rebuilt for this web-only correction.
