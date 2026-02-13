#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${REPO_ROOT}" ]]; then
  echo "Error: Not inside a git repository."
  exit 1
fi
cd "${REPO_ROOT}"

if [[ -f "e2e/maestro.env.sh" ]]; then
  # shellcheck disable=SC1091
  source "e2e/maestro.env.sh"
fi

JAVA_17_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
if [[ -z "${JAVA_17_HOME}" ]]; then
  echo "Error: Java 17 is required for Maestro. Install it with: brew install openjdk@17"
  exit 1
fi
export JAVA_HOME="${JAVA_17_HOME}"
export PATH="${JAVA_HOME}/bin:${PATH}"

export MAESTRO_DRIVER_STARTUP_TIMEOUT=900000

mkdir -p "e2e/maestro/artifacts/debug"
maestro start-device --platform ios

UDID="$(xcrun simctl list devices booted | awk -F '[()]' '/Booted/{print $2; exit}')"
if [[ -z "${UDID}" ]]; then
  echo "Error: No booted iOS simulator found."
  exit 1
fi

maestro --device "${UDID}" test e2e/flows --include-tags smoke --debug-output e2e/maestro/artifacts/debug
