#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

import {
  FocusMetadataRow,
  normalizeFocusMetadataRow,
  planFocusMetadataSync,
} from '../../utils/focusExcelMapping';
import {
  buildFocusDbCreatePayload,
  buildFocusDbUpdatePayload,
  FocusImportRowForDb,
} from '../../utils/focusImportPayload';
import { extractVideoKey, resolveVideoUrl } from '../../utils/videoKey';

const ROOT = process.cwd();
const TARGET_METADATA_PATH = path.join(ROOT, 'data', 'focus_points_metadata.json');
const DEFAULT_SUPABASE_URL = 'https://lhpczofddvwcyrgotzha.supabase.co';
const DB_BATCH_SIZE = 50;
const KNOWN_VIDEO_BUCKETS = new Set(['drill-videos', 'exercise-videos', 'exercise-thumbnails']);

type FocusImportRow = FocusImportRowForDb;

function resolveSupabaseUrl(): string {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
    DEFAULT_SUPABASE_URL
  );
}

function resolveSupabaseServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_KEY?.trim() || '';
}

function parseInputPath(argv: string[]): string {
  const firstArg = argv.find(arg => !arg.startsWith('-'));
  if (!firstArg) {
    throw new Error('Missing input path. Usage: npm run focus:import-xlsx -- <path>');
  }

  const resolved = path.resolve(ROOT, firstArg);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Input file not found: ${resolved}`);
  }

  return resolved;
}

function loadSheetRows(workbook: XLSX.WorkBook, sheetName: string): Record<string, unknown>[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });
}

function toStringValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ');
}

function resolveCategoryPath(position: string): string {
  const raw = position.trim();
  if (!raw) return 'holdtraening_faelles';
  if (raw.startsWith('holdtraening_')) return raw;

  const normalized = normalizeText(raw);
  if (normalized.includes('angriber')) return 'holdtraening_angriber';
  if (normalized.includes('midterforsvarer')) return 'holdtraening_midterforsvarer';
  if (normalized.includes('offensiv') && normalized.includes('midtbane')) return 'holdtraening_offensiv_midtbane';
  if (normalized.includes('central') && normalized.includes('midtbane')) return 'holdtraening_central_midtbane';
  if (normalized.includes('malmand') || normalized.includes('maalmand')) return 'holdtraening_maalmand';
  if (normalized.includes('kant') || normalized.includes('wing')) return 'holdtraening_kant';
  if (normalized.includes('back')) return 'holdtraening_back';
  if (normalized.includes('faelles') || normalized.includes('faelles alle positioner') || normalized.includes('felles')) {
    return 'holdtraening_faelles';
  }
  return 'holdtraening_faelles';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toMetadataRow(row: FocusImportRow): FocusMetadataRow {
  const { trainer_id: _trainerId, video_url: _videoUrl, ...metadata } = row;
  return metadata;
}

function resolveVideoFields(rawValue: string | null): { video_key: string | null; video_url: string | null } {
  const videoKey = extractVideoKey(rawValue) ?? null;
  if (!videoKey) return { video_key: null, video_url: null };

  if (/^https?:\/\//i.test(videoKey)) {
    return { video_key: null, video_url: videoKey };
  }

  return {
    video_key: videoKey,
    video_url: resolveVideoUrl(videoKey),
  };
}

function keyWillUseDefaultBucket(videoKey: string | null): boolean {
  if (!videoKey) return false;
  if (/^https?:\/\//i.test(videoKey)) return false;
  const firstSegment = videoKey.split('/').filter(Boolean)[0];
  if (!firstSegment) return false;
  return !KNOWN_VIDEO_BUCKETS.has(firstSegment);
}

function normalizeExistingRows(rawRows: unknown): FocusMetadataRow[] {
  if (!Array.isArray(rawRows)) return [];
  return rawRows
    .map(row => {
      if (!row || typeof row !== 'object') return null;
      const normalized = normalizeFocusMetadataRow(row as Record<string, unknown>);
      if (!normalized) return null;
      return {
        ...normalized,
        video_key: extractVideoKey(normalized.video_key) ?? null,
      };
    })
    .filter((row): row is FocusMetadataRow => Boolean(row));
}

function loadExistingRows(): FocusMetadataRow[] {
  if (!fs.existsSync(TARGET_METADATA_PATH)) return [];
  const raw = fs.readFileSync(TARGET_METADATA_PATH, 'utf8');
  return normalizeExistingRows(JSON.parse(raw));
}

function loadIncomingFocusRows(workbook: XLSX.WorkBook): FocusImportRow[] {
  const rows = loadSheetRows(workbook, 'focus_points');

  return rows
    .map(row => {
      const normalized = normalizeFocusMetadataRow(row);
      if (!normalized) return null;

      const trainerId = toStringValue((row as any).trainer_id ?? (row as any).trainer ?? (row as any).trainerId);
      const video = resolveVideoFields(normalized.video_key ?? null);

      return {
        ...normalized,
        video_key: video.video_key,
        video_url: video.video_url,
        trainer_id: trainerId || null,
      };
    })
    .filter((row): row is FocusImportRow => Boolean(row));
}

function formatIds(ids: string[], max = 20): string {
  if (!ids.length) return 'none';
  if (ids.length <= max) return ids.join(', ');
  return `${ids.slice(0, max).join(', ')} ... (+${ids.length - max} more)`;
}

async function syncRowsToSupabase(rows: FocusImportRow[]) {
  const serviceRoleKey = resolveSupabaseServiceRoleKey();
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY. Import cannot sync to Supabase without service role credentials.');
  }

  const supabase = createClient(resolveSupabaseUrl(), serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const updatedIds: string[] = [];
  const createdIds: string[] = [];
  const missingIds: string[] = [];

  for (let from = 0; from < rows.length; from += DB_BATCH_SIZE) {
    const batch = rows.slice(from, from + DB_BATCH_SIZE);
    const batchIds = batch.map(row => row.id);

    const { data: existingRows, error: selectError } = await supabase
      .from('exercise_library')
      .select('id')
      .in('id', batchIds);
    if (selectError) {
      throw new Error(`Supabase read failed: ${selectError.message}`);
    }

    const existingIds = new Set((existingRows ?? []).map(row => String((row as any).id)));
    const updatable = batch.filter(row => existingIds.has(row.id));
    const creatable = batch.filter(row => !existingIds.has(row.id));

    for (const row of updatable) {
      const { data: updatedRow, error: updateError } = await supabase
        .from('exercise_library')
        .update(buildFocusDbUpdatePayload(row))
        .eq('id', row.id)
        .select('id')
        .maybeSingle();

      if (updateError) {
        throw new Error(`Supabase update failed: ${updateError.message}`);
      }

      if (!updatedRow) {
        missingIds.push(row.id);
        continue;
      }

      updatedIds.push(row.id);
    }

    if (creatable.length === 0) continue;

    const invalidIdRows = creatable.filter(row => !isUuid(row.id));
    if (invalidIdRows.length > 0) {
      throw new Error(`Invalid id UUID for new rows: ${formatIds(invalidIdRows.map(row => row.id))}`);
    }

    for (const row of creatable) {
      const payload = buildFocusDbCreatePayload(row, resolveCategoryPath(row.position));

      const { data: insertedRow, error: insertError } = await supabase
        .from('exercise_library')
        .insert(payload)
        .select('id')
        .maybeSingle();

      if (insertError) {
        throw new Error(`Supabase create failed: ${insertError.message}`);
      }

      if (!insertedRow) {
        missingIds.push(row.id);
        continue;
      }

      createdIds.push(row.id);
    }
  }

  return { updatedIds, createdIds, missingIds };
}

async function main() {
  const inputPath = parseInputPath(process.argv.slice(2));
  const workbook = XLSX.readFile(inputPath);

  const existing = loadExistingRows();
  const incoming = loadIncomingFocusRows(workbook);
  const incomingMetadata = incoming.map(toMetadataRow);
  const plan = planFocusMetadataSync(existing, incomingMetadata);

  const defaultBucketRows = incoming.filter(row => keyWillUseDefaultBucket(row.video_key));
  if (defaultBucketRows.length > 0) {
    const sampleKeys = defaultBucketRows
      .map(row => row.video_key)
      .filter((value): value is string => Boolean(value))
      .slice(0, 5);
    console.log(
      `[focus:import-xlsx] Warning: ${defaultBucketRows.length} rows use video keys without bucket prefix and will default to "drill-videos".`
    );
    if (sampleKeys.length > 0) {
      console.log(`[focus:import-xlsx] Sample keys: ${sampleKeys.join(', ')}`);
    }
  }

  console.log(
    '[focus:import-xlsx] DB sync scope: update only video_key, video_url, filename, drejebog. Other metadata is synced to data/focus_points_metadata.json.'
  );
  console.log(
    '[focus:import-xlsx] Create contract: new rows are inserted as system rows with trainer_id=null and is_system=true.'
  );

  fs.mkdirSync(path.dirname(TARGET_METADATA_PATH), { recursive: true });
  fs.writeFileSync(TARGET_METADATA_PATH, `${JSON.stringify(plan.nextRows, null, 2)}\n`, 'utf8');

  const dbSync = await syncRowsToSupabase(incoming);

  console.log(`Imported ${incoming.length} rows from ${path.relative(ROOT, inputPath)}`);
  console.log(`Updated: ${plan.updated.length} (${plan.updatedIds.join(', ') || 'none'})`);
  console.log(`Created: ${plan.created.length} (${plan.createdIds.join(', ') || 'none'})`);
  console.log(`Supabase synced: ${dbSync.updatedIds.length} (${formatIds(dbSync.updatedIds)})`);
  console.log(`Supabase created: ${dbSync.createdIds.length} (${formatIds(dbSync.createdIds)})`);
  if (dbSync.missingIds.length > 0) {
    console.log(`Supabase missing ids: ${dbSync.missingIds.length} (${formatIds(dbSync.missingIds)})`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
