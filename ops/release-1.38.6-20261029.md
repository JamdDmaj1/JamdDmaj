# 1.38.6 — Android account access and current web features

VersionCode 162, package com.jamddmaj.ai. Update must be installed over the
existing app, without uninstalling or clearing data. No wallet migration,
financial signature, transfer, limit change or bot activation is part of this release.

Includes device-local encrypted persistence of the Google-linked opaque access
session (AndroidKeyStore AES-GCM), startup restoration before identity checks,
and actionable welcome-check progress/error handling. Server access still
expires after seven days and is verified; this does not create unlimited login
or extra AI credits. Existing installs may need one explicit Google sign-in
after updating to seed encrypted persistence. Each device has its own session.

Also brings the recent web launch animation, grounded product/navigation help,
progressive response presentation and refreshed Discover into Android assets.
This is presentation/product guidance, not a claim that provider outages or all
financial execution conditions have been resolved.

Discover and its styles/tour were reviewed. The recently published visual
refresh remains included unchanged; the internal Android access-storage fix
requires no new marketing claims. Release source excludes unrelated probes and
local screenshots. Signing stays in the existing CI workflow and permanent key.

Verification and publication results will be appended only after observed.
