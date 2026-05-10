#!/bin/bash

# WHISPER Android Build Script
# This script helps build the Android app without errors

set -e

echo "🚀 WHISPER Android Build Script"
echo "================================"

# Check Java installation
echo "✅ Checking Java installation..."
if ! command -v java &> /dev/null; then
    echo "❌ Java not found. Please install Java 17+"
    exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | grep -oP 'version "\K[^"]+' | cut -d. -f1)
if [ "$JAVA_VERSION" -lt 17 ]; then
    echo "⚠️  Java version is $JAVA_VERSION. Recommended Java 17+"
fi

# Navigate to mobile directory
cd "$(dirname "$0")/mobile" || exit 1

echo "📦 Installing npm dependencies..."
npm install

cd android || exit 1

echo "🧹 Cleaning previous builds..."
./gradlew clean

echo "🏗️  Building Android App Bundle..."
./gradlew bundleRelease

echo ""
echo "✅ Build completed successfully!"
echo ""
echo "📍 Output location:"
ls -lh app/build/outputs/bundle/release/app-release.aab 2>/dev/null || echo "AAB file not found - check build errors above"

echo ""
echo "💡 Next steps:"
echo "1. Upload to Google Play Console"
echo "2. Or test with APK: ./gradlew assembleDebug"
echo "3. Install debug APK: adb install app/build/outputs/apk/debug/app-debug.apk"

exit 0
