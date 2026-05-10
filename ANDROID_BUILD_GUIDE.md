# Android Build Guide for WHISPER App

## 📋 Prerequisites

Before building the `.aab` file, ensure you have:
- Android SDK 35 installed
- Build Tools 34.0.0 or higher
- Java 17+ (set via `JAVA_HOME`)
- Node.js 18+ installed
- All npm dependencies installed: `npm install` in `/mobile` directory

## 🔑 Setting Up Release Signing (Production)

For production release, you need a proper keystore. To generate one:

```bash
cd mobile/android/app

# Generate release keystore
keytool -genkey -v -keystore release.keystore -keyalg RSA -keysize 2048 -validity 10000 -alias whisper

# When prompted, enter your key details
```

Then update `build.gradle` with your keystore credentials in the `release` signingConfig block.

## 🛠️ Building Steps

### Step 1: Clean Previous Builds
```bash
cd mobile/android

# Clean gradle cache
./gradlew clean

# Or use: gradlew clean (on Windows)
```

### Step 2: Install Dependencies
```bash
cd mobile

# Install npm dependencies
npm install

# Go back to android folder
cd android
```

### Step 3: Build the Bundle

#### Option A: Using EAS CLI (Recommended for Production)
```bash
cd mobile

# Install EAS CLI globally
npm install -g eas-cli

# Login to EAS (requires account at expo.dev)
eas login

# Build for production
eas build --platform android --app-variant production
```

#### Option B: Using Gradle Directly (Local Build)
```bash
cd mobile/android

# Build AAB
./gradlew bundleRelease

# Or build APK instead (for testing)
./gradlew assembleRelease
```

## 📦 Output Locations

### Using Gradle:
- **AAB**: `android/app/build/outputs/bundle/release/app-release.aab`
- **APK**: `android/app/build/outputs/apk/release/app-release.apk`

### Using EAS:
- Download from EAS dashboard after build completes

## 🐛 Troubleshooting Common Errors

### Error: "JAVA_HOME not set"
```bash
# Set JAVA_HOME to your Java 17+ installation
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

# Verify it's set
echo $JAVA_HOME
```

### Error: "Gradle build timeout"
Try building with more memory:
```bash
cd mobile/android

# Export JVM args
export GRADLE_OPTS="-Xmx4096m -XX:MaxMetaspaceSize=1024m"

./gradlew bundleRelease
```

### Error: "SDK version mismatch"
Ensure gradle.properties has correct versions:
```
compileSdkVersion=35
targetSdkVersion=35
minSdkVersion=24
```

### Error: "Dependency conflicts"
Run:
```bash
cd mobile/android
./gradlew bundleRelease --stacktrace
```

This shows detailed error information.

### Error: "Native build failed"
If you see native compilation errors:
```bash
cd mobile

# Clean and reinstall dependencies
rm -rf node_modules
npm install

# Then try building again
cd android
./gradlew clean bundleRelease
```

### Error: "Keystore not found"
Make sure you have `debug.keystore` in `mobile/android/app/` directory, or generate one:
```bash
cd mobile/android/app

keytool -genkey -v -keystore debug.keystore -keyalg RSA -keysize 2048 -validity 10000 -alias androiddebugkey
# Password: android
# Alias password: android
```

## ✅ Verification Steps

After build completes:

1. Check file exists:
   ```bash
   ls -lh android/app/build/outputs/bundle/release/app-release.aab
   ```

2. Validate AAB (optional):
   ```bash
   bundletool validate --bundle-path=app-release.aab
   ```

3. Upload to Google Play Console (if distributing)

## 🚀 Performance Optimizations (Already Applied)

- ✅ R8 minification enabled for smaller APK/AAB
- ✅ PNG crunching enabled
- ✅ ProGuard rules configured for native libraries
- ✅ JVM memory allocated (4GB)
- ✅ Gradle parallel execution enabled
- ✅ Agora SDK properly protected from obfuscation
- ✅ All React Native modules properly configured

## 📝 Important Notes

1. **For Development**: Use `./gradlew assembleDebug` to build APK for testing
2. **For Production**: Use `.aab` format (AAB) for Google Play Store distribution
3. **Version Updates**: Change `versionCode` and `versionName` in `app/build.gradle` for each release
4. **ProGuard Rules**: Keep the comprehensive rules in `proguard-rules.pro` - they protect critical libraries

## 🎯 Next Steps

1. Test APK first: `./gradlew assembleDebug`
2. Install on device: `adb install app/build/outputs/apk/debug/app-debug.apk`
3. Test thoroughly
4. Build release: `./gradlew bundleRelease`
5. Upload to Google Play Console

---

For more help, check:
- React Native docs: https://reactnative.dev/docs/signed-apk-android
- Expo docs: https://docs.expo.dev/build/setup/
- Gradle docs: https://docs.gradle.org/
