# JamdDmaj AI v1.37.29

- Added a pro trader autopilot profile for Bitget execution: conservative, balanced, or aggressive.
- Added a late-entry filter so the VPS skips fresh signals that already moved too far from the planned entry.
- Added VPS symbol learning so weak patterns can cool down automatically after enough poor outcomes.
- Exposed the autopilot profile and max late-entry move in the app and client connector setup.
- Improved executor diagnostics so the app shows the active autopilot profile and drift limit.
