# Sidebar overlay fix — verified locally, not published

Desktop hamburger always called mobile openSidebar, activating a full-screen
blur overlay while desktop sidebar lacked the mobile z-index, thus covering
both content and navigation. Desktop now toggles collapsed grid/sidebar without
overlay. Mobile retains overlay below drawer, outside-click/Escape close.
Desktop breakpoint CSS also suppresses stale overlay, resize clears it. Menu
has aria-controls and updated expanded state. Tour openSidebar still opens
explicitly rather than toggling, so its side-navigation steps remain valid.

Real page CSS and extracted actual sidebar functions tested at 1280/390px with
Markets visible. Desktop collapse/reopen has no overlay; mobile hit testing
confirms sidebar above overlay and outside click closes it. No user session,
wallet, signing or funds involved. Discover files reviewed; bug-only navigation
repair requires no changed public capability claim or tour marketing copy.
