#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

import { parse } from 'csv-parse/sync';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../src/types/supabase';

type RawCsvRow = {
  focus_area: string;
  category_path: string;
  star_rating: string | number;
  how_to: string;
  why: string;
};

type NormalizedRow = {
  title: string;
  categoryPath: string;
  difficulty: number;
  description: string;
};

type CliOptions = {
  csvPath: string;
  dryRun: boolean;
  deletePrefix?: string;
  deleteOnly: boolean;
  trainerId?: string;
  batchSize: number;
};

type ExistingRow = {
  id: string;
  title: string;
  category_path: string | null;
};

type UpsertPayload = {
  id?: string;
  trainer_id: string;
  title: string;
  description: string;
  category_path: string;
  difficulty: number;
  video_url: string | null;
  is_system: boolean;
};

const HELP_TEXT = `holdtraening importer

Usage:
  pnpm seed:holdtraening --trainer-id <uuid> [options]

Options:
  --trainer-id <uuid>   Trainer ID that owns the system rows (required)
  --csv <path>          Path to the holdtraening CSV (default data/holdtraening.csv)
  --dry-run             Do not write to Supabase, only print the plan
  --delete-prefix <v>   Delete existing system rows whose category_path starts with <v>
  --delete-only         Perform the delete step and exit (requires --delete-prefix)
  --batch-size <n>      Upsert batch size (default 50)
  --help                Show this message
`;

const DEFAULT_BATCH_SIZE = 50;
const TRAINER_ID_REQUIRED = true;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    csvPath: path.resolve(process.cwd(), 'data/holdtraening.csv'),
    dryRun: false,
    deleteOnly: false,
    batchSize: DEFAULT_BATCH_SIZE,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--help':
      case '-h':
        console.log(HELP_TEXT.trim());
        process.exit(0);
        break;
      case '--csv':
      case '-c': {
        const value = argv[i + 1];
        if (!value) throw new Error('Missing value for --csv');
        options.csvPath = path.resolve(process.cwd(), value);
        i += 1;
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--delete-prefix':
        options.deletePrefix = argv[i + 1];
        if (!options.deletePrefix) throw new Error('Missing value for --delete-prefix');
        i += 1;
        break;
      case '--delete-only':
        options.deleteOnly = true;
        break;
      case '--trainer-id':
      case '-t': {
        const value = argv[i + 1];
        if (!value) throw new Error('Missing value for --trainer-id');
        options.trainerId = value.trim();
        i += 1;
        break;
      }
      case '--batch-size': {
        const value = Number(argv[i + 1]);
        if (!Number.isFinite(value) || value < 1) throw new Error('Invalid value for --batch-size');
        options.batchSize = Math.floor(value);
        i += 1;
        break;
      }
      default:
        if (token?.startsWith('-')) {
          throw new Error(`Unknown flag: ${token}`);
        }
    }
  }

  if (options.deleteOnly && !options.deletePrefix) {
    throw new Error('--delete-only requires --delete-prefix');
  }

  return options;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env variable ${name}`);
  }
  return value;
}

function ensureTrainerId(options: CliOptions): string {
  if (!TRAINER_ID_REQUIRED) return options.trainerId ?? '';
  if (!options.trainerId) {
    throw new Error('public.exercise_library.trainer_id is NOT NULL. Rerun with --trainer-id <uuid>.');
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(options.trainerId)) {
    throw new Error('Invalid --trainer-id value. Expected a UUID.');
  }
  return options.trainerId;
}

function loadCsvRows(csvPath: string): RawCsvRow[] {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }
  const raw = fs.readFileSync(csvPath, 'utf8');
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  }) as RawCsvRow[];
  if (!Array.isArray(records) || !records.length) {
    throw new Error('CSV did not contain any data rows.');
  }
  return records;
}

function normalizeCsvRows(records: RawCsvRow[]): NormalizedRow[] {
  return records.map((row, index) => {
    const csvLine = index + 2; // account for header
    const title = (row?.focus_area ?? '').trim();
    if (!title) throw new Error(`Missing focus_area in CSV line ${csvLine}`);

    const categoryPath = (row?.category_path ?? '').trim();
    if (!categoryPath) throw new Error(`Missing category_path for "${title}" (line ${csvLine})`);

    const difficulty = clampDifficulty(row?.star_rating, csvLine, title);
    const howTo = parseHowTo(row?.how_to, csvLine, title);
    const why = (row?.why ?? '').trim();
    const description = buildDescription(howTo, why);

    return {
      title,
      categoryPath,
      difficulty,
      description,
    };
  });
}

function clampDifficulty(value: string | number | undefined, csvLine: number, title: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid star_rating for "${title}" (line ${csvLine}). Expected number between 0-5.`);
  }
  return Math.max(0, Math.min(5, Math.round(n)));
}

function parseHowTo(raw: string | undefined, csvLine: number, title: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(step => String(step || '').trim()).filter(Boolean);
  } catch (err) {
    throw new Error(`Invalid how_to JSON for "${title}" (line ${csvLine}): ${(err as Error).message}`);
  }
}

function buildDescription(howTo: string[], why: string): string {
  const blocks: string[] = [];
  if (howTo.length) {
    blocks.push(['Sådan gør du:', ...howTo.map(step => `- ${step}`)].join('\n'));
  }
  if (why) {
    blocks.push(`Hvorfor værdifuldt:\n${why}`);
  }
  return blocks.join('\n\n');
}

async function deleteByPrefix(
  client: SupabaseClient<Database>,
  prefix: string,
  dryRun: boolean
): Promise<number> {
  const normalized = prefix.replace(/\*/g, '%');
  const likePattern = normalized.includes('%') || normalized.includes('_') ? normalized : `${normalized}%`;

  const { data, error } = await client
    .from('exercise_library')
    .select('id,title,category_path')
    .eq('is_system', true)
    .ilike('category_path', likePattern);

  if (error) throw error;
  const matches = data || [];

  if (!matches.length) {
    console.log(`No system exercises matched delete prefix "${prefix}".`);
    return 0;
  }

  if (dryRun) {
    console.log(`[dry-run] Would delete ${matches.length} system exercises matching "${likePattern}".`);
    return matches.length;
  }

  const { error: deleteError } = await client
    .from('exercise_library')
    .delete()
    .eq('is_system', true)
    .ilike('category_path', likePattern);

  if (deleteError) throw deleteError;

  console.log(`Deleted ${matches.length} system exercises matching "${likePattern}".`);
  return matches.length;
}

async function fetchExistingMap(
  client: SupabaseClient<Database>,
  categoryPaths: string[]
): Promise<Map<string, ExistingRow>> {
  if (!categoryPaths.length) return new Map();

  const { data, error } = await client
    .from('exercise_library')
    .select('id,title,category_path')
    .eq('is_system', true)
    .in('category_path', categoryPaths);

  if (error) throw error;

  const map = new Map<string, ExistingRow>();
  (data || []).forEach(row => {
    map.set(makeKey(row.title, row.category_path), row as ExistingRow);
  });
  return map;
}

function makeKey(title: string, categoryPath: string | null): string {
  return `${title.toLowerCase()}::${(categoryPath ?? '').toLowerCase()}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const trainerId = ensureTrainerId(cli);
  const csvRows = normalizeCsvRows(loadCsvRows(cli.csvPath));
  const uniqueCategoryPaths = Array.from(new Set(csvRows.map(row => row.categoryPath)));

  console.log(`Loaded ${csvRows.length} rows from ${path.relative(process.cwd(), cli.csvPath)}.`);

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const client = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  if (cli.deletePrefix) {
    await deleteByPrefix(client, cli.deletePrefix, cli.dryRun);
    if (cli.deleteOnly) {
      console.log('Delete-only flag set. Skipping insert/update step.');
      return;
    }
  }

  const existingMap = await fetchExistingMap(client, uniqueCategoryPaths);
  console.log(`Found ${existingMap.size} existing system exercises in the targeted categories.`);

  const updates: UpsertPayload[] = [];
  const inserts: UpsertPayload[] = [];

  csvRows.forEach(row => {
    const payload: UpsertPayload = {
      trainer_id: trainerId,
      title: row.title,
      description: row.description,
      category_path: row.categoryPath,
      difficulty: row.difficulty,
      video_url: null,
      is_system: true,
    };

    const key = makeKey(row.title, row.categoryPath);
    const existing = existingMap.get(key);
    if (existing) {
      payload.id = existing.id;
      updates.push(payload);
    } else {
      inserts.push(payload);
    }
  });

  const totalPlanned = updates.length + inserts.length;
  console.log(`Plan: ${updates.length} updates, ${inserts.length} inserts (total ${totalPlanned}).`);

  if (!totalPlanned) {
    console.log('Nothing to do.');
    return;
  }

  if (cli.dryRun) {
    console.log('[dry-run] No changes were sent to Supabase.');
    const sample = [...updates, ...inserts].slice(0, 3);
    sample.forEach((payload, idx) => {
      console.log(`Sample payload #${idx + 1}:`, JSON.stringify(payload, null, 2));
    });
    return;
  }

  const batches = chunk([...updates, ...inserts], cli.batchSize);
  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    const { error } = await client
      .from('exercise_library')
      .upsert(batch, { returning: 'minimal' });
    if (error) {
      throw new Error(`Supabase upsert failed for batch ${i + 1}/${batches.length}: ${error.message}`);
    }
    console.log(`Processed batch ${i + 1}/${batches.length} (${batch.length} rows).`);
  }

  console.log('Holdtræning import completed successfully.');
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
