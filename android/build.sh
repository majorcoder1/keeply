#!/usr/bin/env bash
# Build the signed release APK and copy it next to the Keeply project.
# The drive is FAT32 (no exec bit), so run this as: bash build.sh
set -euo pipefail
cd "$(dirname "$0")"

bash gradlew --offline :app:assembleRelease

VERSION=$(grep -oP 'versionName = "\K[^"]+' app/build.gradle.kts)
cp app/build/outputs/apk/release/app-release.apk "../Keeply-$VERSION.apk"
echo "Built ../Keeply-$VERSION.apk"
