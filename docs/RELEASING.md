# Making a release APK

The release build is signed with the **debug key** by default. That is fine for installing on your own phone or sending to friends, but it is **not** suitable for Google Play or for updates people can trust. Make your own key first.

## 1. Build locally (Windows)

Use a short project path such as `C:\mm` (Windows' 260-character limit breaks the native build otherwise), and Android Studio's JDK:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
cd android
npm install
npx expo prebuild --platform android
cd android
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64
```

The APK is at `android/android/app/build/outputs/apk/release/app-release.apk`. Install it with `adb install`.

## 2. Sign it properly (before you share it widely)

1. Make a key and **back it up somewhere safe** (lose it and you cannot update the app):
   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore milkymic-release.keystore -alias milkymic -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Put the key file and its passwords in your **user** Gradle file (`~/.gradle/gradle.properties`), never in the repo.
3. Point the `release` signing config in `android/android/app/build.gradle` at it.

## 3. Or build in the cloud

`npx eas-cli build -p android --profile production` builds and signs on Expo's servers. It needs a free Expo account.

## Checklist

- [ ] `cd web && npm test` passes
- [ ] `cd android && npx tsc --noEmit` passes
- [ ] Tried on a real phone: pairing, audio on the PC, screen off, Wi-Fi drop and return
- [ ] Version bumped in `android/app.json` and `CHANGELOG.md` updated
