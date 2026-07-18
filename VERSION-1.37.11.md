# JamdDmaj AI v1.37.11

- Upgraded the client Bitget connector flow so the app copies a full VPS installer, not just raw env settings.
- The installer creates a private client connector directory, writes the Bitget env locally on the VPS, installs the automatic 30-second service, and shows service status/logs.
- Client Bitget keys still stay off JamdDmaj Cloud; they are generated locally into the copied VPS installer.
