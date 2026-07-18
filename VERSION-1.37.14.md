# JamdDmaj AI v1.37.14

- Fixed app update detection so the app no longer depends only on a manually updated Vercel version variable.
- The status API now checks the latest GitHub Release and returns the official APK download URL.
- The app also checks GitHub Releases directly as a fallback if the server is stale or unavailable.
- The Updates panel now shows a clear Download APK button and opens the official APK with the native browser when installed as an APK.
- The app checks for updates automatically on startup and when it returns to the foreground.
