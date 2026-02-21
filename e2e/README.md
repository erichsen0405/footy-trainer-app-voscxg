# Maestro smoke / golden paths

## Smoke flows (7)

- `e2e/flows/auth_flow_smoke.yaml`
- `e2e/flows/paywall_gating_smoke.yaml`
- `e2e/flows/activity_task_flow_smoke.yaml`
- `e2e/flows/library_add_to_tasks_smoke.yaml`
- `e2e/flows/notifications_permission_smoke.yaml`
- `e2e/flows/role_based_ui_smoke.yaml`
- `e2e/flows/error_retry_smoke.yaml`

Alle ovenstående har `tags: [smoke]`.

## Support flows (ikke standalone tests)

- `e2e/flows/_dev_client_bootstrap.yaml` (dev client bootstrap)
- `e2e/flows/_post_login_prompt_cleanup.yaml` (post-login prompt cleanup)
- `e2e/flows/_platform_keyboard_commit_input.yaml` (iOS/Android keyboard override)
- `e2e/flows/_platform_notifications_prompt_allow.yaml` (iOS allow prompt override)
- `e2e/flows/_platform_notifications_prompt_deny.yaml` (iOS deny prompt override)

## Required env vars

- `MAESTRO_EMAIL`: entitled test user email
- `MAESTRO_PASSWORD`: entitled test user password
- `MAESTRO_LOCKED_EMAIL`: non-entitled user email (paywall-gated)
- `MAESTRO_LOCKED_PASSWORD`: non-entitled user password
- `MAESTRO_FEEDBACK_NOTE`: note text used in feedback smoke
- `MAESTRO_PLAYER_EMAIL`: player account (role-based UI flow)
- `MAESTRO_PLAYER_PASSWORD`: player password
- `MAESTRO_TRAINER_EMAIL`: trainer/admin account (role-based UI flow)
- `MAESTRO_TRAINER_PASSWORD`: trainer/admin password
- `MAESTRO_TEAM_PLAYER_EMAIL` (optional): player email used in team/player CRUD (defaults to `MAESTRO_PLAYER_EMAIL`)
- `MAESTRO_PLATFORM_SUFFIX` (optional): suffix used in created object names to avoid cross-platform collisions (`ios` / `android`)
- `MAESTRO_APP_ID` (optional): platform app package/bundle id. Defaults: Android=`com.anonymous.FootballCoach`, iOS=`com.erichsen.footballcoach`.

## Platform env profiles (.sh)

- iOS: `e2e/maestro.env.ios.sh`
- Android: `e2e/maestro.env.android.sh`
- Begge profiler bruger samme `MAESTRO_*` variabelnavne, så flows er shared.
- Kør iOS og Android parallelt med separate konti i hver profil for at undgå data-races.
- Profilerne er defaults/placeholders; overstyr i terminal med rigtige credentials før kørsel.

## Run all smoke/golden paths (iOS)

- `source e2e/maestro.env.ios.sh`
- `npm run e2e:ios:all`

## Run all smoke/golden paths (Android)

- `source e2e/maestro.env.android.sh`
- `npm run e2e:android:all`
- Device auto-detect: script vælger første booted emulator fra `adb devices` hvis `MAESTRO_DEVICE_ID`/`ANDROID_DEVICE_ID` ikke er sat.
- Overstyr device manuelt: `MAESTRO_DEVICE_ID=<adb-device-id> npm run e2e:android:all`

## Run single flow

- iOS: `npm run e2e:ios:auth-flow`
- Android: `npm run e2e:android:auth-flow`
- iOS: `npm run e2e:ios:notifications-permission-flow`
- Android: `npm run e2e:android:notifications-permission-flow`
- iOS: `npm run e2e:ios:role-based-ui-flow`
- Android: `npm run e2e:android:role-based-ui-flow`

## Legacy PowerShell helper

- `powershell -ExecutionPolicy Bypass -File e2e/run-smoke.ps1`
- `powershell -ExecutionPolicy Bypass -File e2e/run-smoke.ps1 -Repeat 3`

## Debug output path

- Scripted smoke run skriver debug artifacts til: `e2e/maestro/artifacts/debug`
- Manuel kørsel med debug output:
  - `maestro test --include-tags smoke --debug-output e2e/maestro/artifacts/debug e2e/flows`

## iOS limitation (offline/error-retry)

- `error_retry_smoke.yaml` bruger deterministisk netværksfejl på Android via `setAirplaneMode`.
- iOS Simulator understøtter ikke airplane mode i Maestro på samme måde.
- Manuel iOS workaround:
  1. Log ind og gå til Bibliotek.
  2. Slå Wi-Fi/net fra i simulatoren.
  3. Bekræft fejlstate + `Prøv igen`.
  4. Slå net til igen.
  5. Tryk `Prøv igen` og bekræft at biblioteket loader igen.
