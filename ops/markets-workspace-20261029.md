# Markets workspace layout — local verification, publication pending

Markets was capped at 46vh/430px (52vh on mobile), leaving chat content and its
composer below it with competing scroll areas. Visible ticker now flexes to the
remaining main workspace height, hides only sibling chat/composer via CSS, and
restores them on close without clearing chat/draft. Added ES/EN Back to chat
button through existing toggle handler. More defined heading/cards and wrapping
toolbar avoid mobile overflow. No API, trading or authentication changes.

Browser layout test with actual page CSS and synthetic rows at 1280/390px:
market viewport >500px, no document horizontal overflow, chat/composer hidden,
composer restored on close. Screenshots inspected after removing the test's
static launch overlay (scripts intentionally disabled). Does not test live data.
Discover ES/EN market copy and walkthrough aligned; HTML/CSS/tour CSS reviewed
and existing structure remains appropriate. No publication claim yet.
