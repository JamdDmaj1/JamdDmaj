# Temporary response activity

Source d199987. Added an accessible response-activity panel for actual client stages (request received, context lookup, preparing answer, displaying answer). History is held in a WeakMap only, not a reasoning transcript. Final response, cancellation and error all remove the panel; no internal model reasoning, simulated commands or provider-token streaming claim.

Nine focused tests passed. Three isolated browser scenarios verify visible activity and its removal after success, failure and stop with no page errors. Build and diff check passed. No real account/provider request, quota change or financial action.

Correct Vercel project/team verified. Clean committed export; staged production dpl_GcGrcxNJn4SYqcJb1EpNJ1pBXc8s READY (eight-second build), authenticated candidate HTML equals local output. Promoted unchanged; public exact-source and browser visible-then-removed activity check passed using synthetic identity/provider. Bounded runtime error scan zero records. Web-only; existing APK unchanged.
