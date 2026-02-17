# Football coach

This app was built using [Natively.dev](https://natively.dev) - a platform for creating mobile apps.

Made with ðŸ’™ for creativity.

## Password reset flow

- Reset-flow er app-first og bruger deep link: `footballcoach://auth/recovery-callback`.
- Det betyder at "Glemt adgangskode" er designet til at aabne appen direkte fra mail-linket.
- Web/desktop reset-flow er ikke primary path i den nuvaerende implementation.

## Running tests

Run the Jest test suite headless (no emulator/device required):

```bash
npm test
```

Optional watch mode:

```bash
npm test -- --watch
```

## CI

- PR CI kører altid: `npm run typecheck`, `npm run lint`, `npm test`.
- iOS E2E kører som default ikke på PR.
- Tilføj PR label `run-e2e-ios` eller `run-e2e-ios-all` for at køre hele iOS E2E-suiten.
- Tilføj en eller flere flow-labels for enkelttests:
  - `run-e2e-ios-activity-task`
  - `run-e2e-ios-auth`
  - `run-e2e-ios-error-retry`
  - `run-e2e-ios-library-add-to-tasks`
  - `run-e2e-ios-notifications-permission`
  - `run-e2e-ios-paywall-gating`
  - `run-e2e-ios-role-based-ui`
- Hvis `run-e2e-ios`/`run-e2e-ios-all` er sat, vinder den og kører hele suiten.
- iOS E2E kan også startes manuelt via `workflow_dispatch`.
- Bootstrap-håndtering:
  - `all` kører den dedikerede suite med `_dev_client_bootstrap.yaml` først.
  - Enkelttests bruger de enkelte smoke-flow scripts; disse flows håndterer bootstrap internt (`runFlow _dev_client_bootstrap.yaml` eller tilsvarende inline bootstrap).
- Sæt disse GitHub Secrets til E2E:
  - `MAESTRO_EMAIL`
  - `MAESTRO_PASSWORD`
  - `MAESTRO_LOCKED_EMAIL`
  - `MAESTRO_LOCKED_PASSWORD`
  - `MAESTRO_FEEDBACK_NOTE`
  - `MAESTRO_PLAYER_EMAIL`
  - `MAESTRO_PLAYER_PASSWORD`
  - `MAESTRO_TRAINER_EMAIL`
  - `MAESTRO_TRAINER_PASSWORD`
- Sæt disse checks som required i branch protection:
  - `PR CI`
  - `E2E iOS` (kun hvis I vil gøre label-kørt E2E obligatorisk ved merge)

## Maestro Mac runbook (iOS smoke)

Simulator-only setup (not physical iPhone).

Terminal 1:

```bash
npm run ios:metro
```

Terminal 2:

```bash
npm run e2e:ios:smoke
```

## HoldtrÃ¦ning importer

We now have a dedicated script for seeding the FootballCoach holdtrÃ¦ning focus areas into Supabase.

1. Export or copy the latest CSV to `data/holdtraening.csv` (already tracked in the repo).
2. Provide Supabase credentials via env vars:
	- `SUPABASE_URL`
	- `SUPABASE_SERVICE_ROLE_KEY`
3. Run one of the npm scripts:

```bash
pnpm seed:holdtraening --trainer-id <uuid>        # real import
pnpm seed:holdtraening:dry-run --trainer-id <uuid>
```

Useful flags:

- `--delete-prefix holdtraening` removes existing system rows whose `category_path` starts with `holdtraening` before importing.
- `--delete-only` performs the delete step and exits (requires `--delete-prefix`).
- `--csv <path>` to point at a different CSV file.
- `--batch-size <n>` controls how many rows are upserted per request (default 50).

The script enforces `trainer_id` because `public.exercise_library.trainer_id` is `NOT NULL`. Pass the UUID for the system/trainer account that should own the seeded rows.
