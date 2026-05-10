# Quick Build Commands for WHISPER

## One-Line Build Commands

### Build AAB (Production - Google Play)
```bash
cd mobile/android && ./gradlew clean && ./gradlew bundleRelease
```

### Build APK (Testing)
```bash
cd mobile/android && ./gradlew clean && ./gradlew assembleDebug
```

### Install Debug APK on Device
```bash
cd mobile/android && adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Using the Build Script
```bash
chmod +x build-android.sh
./build-android.sh
```

---

## Environment Setup (macOS)

### Set Java Home (if needed)
```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
echo $JAVA_HOME  # Verify it's set
```

### Set Gradle Opts for Better Performance
```bash
export GRADLE_OPTS="-Xmx4096m -XX:MaxMetaspaceSize=1024m"
```

### Check Android SDK Installation
```bash
echo $ANDROID_HOME
ls $ANDROID_HOME/platforms  # Should see android-35
```

---

## If Build Fails

### Step 1: Clear Everything
```bash
cd mobile/android
./gradlew clean
cd ..
rm -rf node_modules package-lock.json
npm install
cd android
```

### Step 2: Try Debug Build First
```bash
./gradlew assembleDebug --stacktrace
```

### Step 3: If Still Failing
```bash
# Get detailed error log
./gradlew bundleRelease --stacktrace 2>&1 | tee build-error.log

# The build-error.log will have all details
```

---

## Gradle Wrapper Status

Current Gradle configuration:
- **Gradle Version**: 8.x (managed by Expo)
- **JVM Args**: -Xmx4096m (optimized)
- **Parallel Builds**: Enabled
- **Build Cache**: Enabled

## Build Optimizations Applied

✅ **Minification**: R8 enabled (reduces APK/AAB size)
✅ **ProGuard Rules**: Comprehensive rules for Agora SDK and native libraries
✅ **PNG Crunching**: Reduces image file sizes
✅ **Gradle Caching**: Faster incremental builds
✅ **JVM Memory**: Allocated 4GB for faster compilation
✅ **Dependency Resolution**: Fixed conflicts between libraries

---

## Expected Build Times

- **Debug APK**: 2-5 minutes (first build)
- **Debug APK**: 30-60 seconds (incremental)
- **Release AAB**: 5-10 minutes (includes minification)

If build takes longer, check:
1. Disk space (need ~10GB for build cache)
2. RAM available (recommend 16GB+)
3. Network connection (downloading dependencies)
