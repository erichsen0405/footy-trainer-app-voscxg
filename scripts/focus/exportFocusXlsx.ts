#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

import { serializeHowToCell } from '../../utils/focusExcelMapping';
import { extractVideoKey } from '../../utils/videoKey';

const ROOT = process.cwd();
const PAGE_SIZE = 1000;
const DEFAULT_SUPABASE_URL = 'https://lhpczofddvwcyrgotzha.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxocGN6b2ZkZHZ3Y3lyZ290emhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNTgzMjQsImV4cCI6MjA3OTczNDMyNH0.5oWZ_G5ryy_ae77CG8YMeEDEyAJkSS7Jv4cFZy-G7qA';

type FocusExerciseRow = {
  id: string;
  trainer_id: string | null;
  title: string;
  difficulty: number | null;
  category_path: string | null;
  description: string | null;
  filename: string | null;
  drejebog: string | null;
  video_key: string | null;
  video_url: string | null;
};

type ParsedDescription = {
  howTo: string[];
  whyValuable: string;
};

const CATEGORY_TO_POSITION: Record<string, string> = {
  holdtraening_angriber: 'Angriber',
  holdtraening_back: 'Back',
  holdtraening_central_midtbane: 'Central midtbane',
  holdtraening_faelles: 'Fælles (alle positioner)',
  holdtraening_kant: 'Kant',
  holdtraening_maalmand: 'Målmand',
  holdtraening_midterforsvarer: 'Midterforsvarer',
  holdtraening_offensiv_midtbane: 'Offensiv midtbane',
};

function resolveSupabaseUrl(): string {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
    DEFAULT_SUPABASE_URL
  );
}

function resolveSupabasePublishableKey(): string {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY
  );
}

function resolveOutputPath(argv: string[]): string {
  const direct = argv.find(arg => !arg.startsWith('-'));
  if (direct) return path.resolve(ROOT, direct);

  const isoDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return path.join(ROOT, 'data', `focus_points_metadata_${isoDate}.xlsx`);
}

function resolvePosition(categoryPath: string | null): string {
  if (!categoryPath) return '';
  const mapped = CATEGORY_TO_POSITION[categoryPath];
  if (mapped) return mapped;
  return categoryPath;
}

function parseDescription(description: string | null): ParsedDescription {
  const text = (description ?? '').trim();
  if (!text) {
    return {
      howTo: [],
      whyValuable: '',
    };
  }

  const howMarker = 'Saadan goer du:';
  const whyMarker = 'Hvorfor vaerdifuldt:';

  const normalized = text
    .replace(/Sådan gør du:/g, howMarker)
    .replace(/Hvorfor værdifuldt:/g, whyMarker);

  const whyIndex = normalized.indexOf(whyMarker);
  const howPart = whyIndex >= 0 ? normalized.slice(0, whyIndex) : normalized;
  const whyPart = whyIndex >= 0 ? normalized.slice(whyIndex + whyMarker.length) : '';

  const strippedHow = howPart.replace(howMarker, '').trim();
  const howTo = strippedHow
    .split(/\r?\n/)
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

  return {
    howTo,
    whyValuable: whyPart.trim(),
  };
}

async function fetchAllFocusRows(): Promise<FocusExerciseRow[]> {
  const supabaseUrl = resolveSupabaseUrl();
  const supabaseKey = resolveSupabasePublishableKey();
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const rows: FocusExerciseRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('exercise_library')
      .select('id,trainer_id,title,difficulty,category_path,description,filename,drejebog,video_key,video_url')
      .eq('is_system', true)
      .ilike('category_path', 'holdtraening_%')
      .order('category_path', { ascending: true })
      .order('title', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Supabase export query failed: ${error.message}`);

    const batch = (data ?? []) as FocusExerciseRow[];
    if (!batch.length) break;
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function toSheetRows(rows: FocusExerciseRow[]) {
  return rows.map(row => ({
    id: row.id,
    trainer_id: row.trainer_id ?? '',
    title: row.title,
    difficulty: Number.isFinite(row.difficulty) ? Number(row.difficulty) : 0,
    position: resolvePosition(row.category_path),
    how_to: serializeHowToCell(parseDescription(row.description).howTo),
    why_valuable: parseDescription(row.description).whyValuable,
    filename: row.filename ?? '',
    drejebog: row.drejebog ?? '',
    video_key: extractVideoKey(row.video_key ?? row.video_url) ?? '',
  }));
}

async function main() {
  const outputPath = resolveOutputPath(process.argv.slice(2));
  const rows = await fetchAllFocusRows();

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(toSheetRows(rows), {
    header: ['id', 'trainer_id', 'title', 'difficulty', 'position', 'how_to', 'why_valuable', 'filename', 'drejebog', 'video_key'],
  });

  XLSX.utils.book_append_sheet(workbook, worksheet, 'focus_points');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  XLSX.writeFile(workbook, outputPath);

  console.log(`Exported ${rows.length} rows to ${path.relative(ROOT, outputPath)}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
