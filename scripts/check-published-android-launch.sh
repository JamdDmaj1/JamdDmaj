#!/usr/bin/env bash
set -euo pipefail
# Disposable CI emulator only; no phone, wallet import, login or financial action.
mkdir -p launch-evidence
report_crash() {
  local detail
  detail="$(head -80 "$1")"
  detail="${detail//%/%25}"
  detail="${detail//$'\r'/%0D}"
  detail="${detail//$'\n'/%0A}"
  printf '::error title=Android launch crash::%s\n' "$detail"
}
adb install "$RUNNER_TEMP/app.apk"
adb shell svc wifi disable
adb shell svc data disable
adb shell getprop ro.build.version.release > launch-evidence/android-version.txt
for attempt in 1 2 3; do
  adb shell am force-stop com.jamddmaj.ai
  adb logcat -c
  adb shell am start -W -n com.jamddmaj.ai/.MainActivity > "launch-evidence/start-$attempt.txt"
  sleep 12
  adb logcat -d -b crash > "launch-evidence/crash-$attempt.txt"
  adb shell dumpsys activity activities > "launch-evidence/activities-$attempt.txt"
  adb exec-out screencap -p > "launch-evidence/screen-$attempt.png"
  if ! adb shell pidof com.jamddmaj.ai > "launch-evidence/pid-$attempt.txt"; then
    echo "::error::Published 1.38.8 terminated on cold launch $attempt"
    cat "launch-evidence/crash-$attempt.txt"
    report_crash "launch-evidence/crash-$attempt.txt"
    exit 1
  fi
  if grep -q 'FATAL EXCEPTION' "launch-evidence/crash-$attempt.txt"; then
    cat "launch-evidence/crash-$attempt.txt"
    report_crash "launch-evidence/crash-$attempt.txt"
    exit 1
  fi
done
