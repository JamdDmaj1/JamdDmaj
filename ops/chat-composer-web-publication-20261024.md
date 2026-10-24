# New-conversation composer visibility — 2026-10-24

## Deploy result

- URL: https://www.jamddmaj.com
- Production status READY; framework Other; build duration 6 seconds.
- Final source: `6c99899c27093367e8db1c23fb7a2d416eac2c85`.
- Final deployment: `dpl_71LqkVWxQVPNe65Qysx3buUF2XoN`.
- Tested production candidate: https://jamd-dmaj-jyqbpo2qz-jamd-dmaj-s-projects.vercel.app
- Promoted unchanged. The initial height-only fix was already published as `dpl_Hp2QywgtTqR81xzq45FPJASax9BK`; the final deployment adds robust editor width with optional voice controls.

## Evidence and correction

With 30 fixture conversations at 1306×638, the original shell ended at Y624 but its main column ended at Y2719.5, placing the input at Y2629.4–2669.2. The sidebar's implicit grid minimum expanded the row beyond the clipped viewport. The action toolbar also compressed the heading into an excessively tall header.

The app now declares a bounded minmax grid row, allows the sidebar to shrink and distributes header heading/actions explicitly. The composer uses flex layout with a flexible textarea and fixed-size control buttons, supporting both the initial two buttons and the asynchronously inserted voice button. A transient four-column grid implementation failed the new width assertion when voice appeared; it was not deployed. No authentication, recovery, financial or chat-storage logic changed.

## Verification

- Expanded regression covers 30 saved fixture chats, three repeated new-chat actions, focus without shell scrolling, actual text entry, visible input bounds, bounded header height and adequate editor width.
- Browser sizes: 1306×638, 1365×660, 1365×900 and 430×820.
- Initial focused layout and account-recovery browser run: 16/16 passed. Final composer-specific suite: 3/3 passed with browser enabled; web build succeeded.
- Fresh public browser with isolated synthetic history: input Y532.6–572.6 within a 638px viewport and width 704px inside a 918px composer, including the optional voice control. Screenshot inspected: `.perps-build/chat-composer-publish-20261024/public-final.png`.
- Public browser API writes were blocked, and no message was sent. No real user's storage, conversations or settings were inspected or cleared.
- Initial deployment error-log scan: zero records over the previous ten minutes. No ongoing monitor created.
- No Android package or server-custody deployment performed.

User action: refresh the web page (Ctrl+F5 on Windows) and create a new conversation. Clearing site data or reinstalling is not required.
