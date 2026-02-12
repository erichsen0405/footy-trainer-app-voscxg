# Football coach

This app was built using [Natively.dev](https://natively.dev) - a platform for creating mobile apps.

Made with 💙 for creativity.
## Running tests

Run the Jest test suite headless (no emulator/device required):

```bash
npm test
```

Optional watch mode:

```bash
npm test -- --watch
```
## Holdtræning importer

We now have a dedicated script for seeding the FootballCoach holdtræning focus areas into Supabase.

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

