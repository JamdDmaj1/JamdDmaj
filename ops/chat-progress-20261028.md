# Chat progress presentation

Source 30eac46. Added labels at actual client tasks: checking available context, then preparing the reply. Visible answer content is revealed progressively (Unicode-safe 64-codepoint chunks), with stop support and immediate rendering for reduced motion. This is presentation of answer text, not internal reasoning or a claim of upstream token streaming. The managed provider API still buffers completed replies. No extra AI requests, quota mutation or financial action. Idle facts are withheld when a conversation or draft exists and hidden on send.

Focused tests: ten passed, one optional layout-browser test skipped; eight progress/session tests rerun and passed. Build and diff check passed. Local and public isolated Edge tests used synthetic authenticated identity and buffered SSE: waiting label visible, partial content before full content, exactly one mock chat request, no local page errors. No real user session/provider usage.

Correct Vercel project/team verified. Clean committed export staged dpl_FMbxLpQFXP2VoEmqTZSHXJQvq6QT READY (seven-second build); authenticated candidate HTML exactly matches local build. Promoted unchanged; public exact-source and progressive rendering checks passed. Web-only publication; existing Android APK unchanged. Screen-area redesign and provider-token streaming are not included in this change.
