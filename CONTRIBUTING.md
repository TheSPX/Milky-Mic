# Contributing to Milky Mic

Thanks for helping! Milky Mic is open source and made to be easy to use, so small, friendly changes are the best ones.

## Good first things

- A pairing flow improvement or a QR code for the pairing code
- Echo and noise cancellation (Android's voice-communication mic source)
- A prebuilt, properly signed APK on GitHub Releases
- Real voice filters (the sheet is a preview today)
- macOS and Linux notes (BlackHole, PulseAudio loopback)

## Run it

```bash
cd web && npm install && npm test     # PC side: server + website, with an end-to-end test
cd android && npm install && npx tsc --noEmit   # phone app type-check
```

To see the phone app without a build, run the demo in Expo Go: `EXPO_PUBLIC_MOCK=1 npx expo start --go`.

## Before you open a pull request

- Keep the ports and the message format in sync between `web/server.js` and `android/src/stream.ts`.
- Add or update a check in `web/test.js` when you change the receiver. The tests must stay silent: they never play sound.
- Say plainly in the pull request what you tested and on which devices.

By contributing you agree your work is released under the [MIT License](LICENSE).
