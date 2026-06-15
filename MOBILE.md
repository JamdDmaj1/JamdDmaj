# JamdDmaj AI mobile

This repository includes Capacitor projects for Android and iOS.

## Prepare the native projects

```sh
npm install
npm run mobile:sync
```

## Android

Install Android Studio and a current Android SDK, then run:

```sh
npm run android
```

Use Android Studio to run the app or generate a signed APK/AAB.

GitHub Actions also builds a test APK automatically. Open the latest
`Build Android APK` run in the repository's Actions tab and download the
`JamdDmaj-AI-APK` artifact.

## iPhone and iPad

On a Mac with Xcode installed, run:

```sh
npm run ios
```

Choose an Apple development team in Xcode before running on a device or
uploading the app to TestFlight.

## AI connection

The app connects directly to OpenRouter. Users can connect with OpenRouter or
enter their OpenRouter API key in Settings. The key is stored only on the
device.

The OpenRouter mobile login returns through the `jamddmaj://oauth` app link.
Deploy the updated `index.html` to Vercel before testing that login flow.
