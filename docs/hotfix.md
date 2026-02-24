# Hotfix Cheatsheet

Simple solo-flow for hotfixes.

## OTA-egnet vs kraever ny build

- OTA-egnet: JS/TS changes only (screens, hooks, logic, copy, styling, queries).
- Kraever ny build: native changes (`app.config.*`, `app.json`, `ios/**`, `android/**`, native deps/plugins, permissions, entitlements).

## Release tag regel

When a version is sent to App Store/TestFlight, create a Git tag on the exact release commit:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Tag is the release point used for later OTA hotfixes for that store version.

## OTA hotfix (kun seneste store-version)

1. Checkout release tag for latest store version:
```bash
git fetch --tags
git checkout vX.Y.Z
```
2. Create hotfix branch:
```bash
git checkout -b hotfix/X.Y.Z-<bug>
```
3. Make fix, commit, push:
```bash
git add -A
git commit -m "fix: <description>"
git push -u origin hotfix/X.Y.Z-<bug>
```
4. Publish OTA to `production` channel:
```bash
eas update --channel production --message "hotfix: <description> (vX.Y.Z)"
```
5. Verify on installed App Store/TestFlight build with version `X.Y.Z`.
6. Cherry-pick or merge fix back to `main`.

## Native hotfix (naar OTA ikke er muligt)

1. Branch from `main`:
```bash
git checkout main
git pull
git checkout -b hotfix/native-<bug>
```
2. Make fix + version bump.
3. Build with production profile (and submit if needed):
```bash
eas build -p ios --profile production
eas build -p android --profile production
```
4. Merge back to `main`.

## Current repo assumptions

- EAS Update channel: `production` (points to branch `production`).
- `runtimeVersion.policy = appVersion`.
- OTA hotfixes target only the latest store app version.
