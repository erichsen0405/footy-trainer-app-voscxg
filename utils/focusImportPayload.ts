import { FocusMetadataRow } from './focusExcelMapping';

export type FocusImportRowForDb = FocusMetadataRow & {
  trainer_id: string | null;
  video_url: string | null;
};

export function buildFocusDbUpdatePayload(row: FocusImportRowForDb) {
  return {
    video_key: row.video_key ?? null,
    video_url: row.video_url ?? null,
    filename: row.filename ?? null,
    drejebog: row.drejebog ?? null,
  };
}

export function buildFocusDbCreatePayload(row: FocusImportRowForDb, categoryPath: string) {
  return {
    id: row.id,
    trainer_id: null,
    title: row.title,
    description: buildFocusDescription(row),
    video_key: row.video_key ?? null,
    video_url: row.video_url ?? null,
    filename: row.filename ?? null,
    drejebog: row.drejebog ?? null,
    difficulty: row.difficulty,
    category_path: categoryPath,
    is_system: true,
  };
}

function buildFocusDescription(row: FocusMetadataRow): string | null {
  const howTo = row.how_to.filter(Boolean);
  const why = row.why_valuable.trim();
  const sections: string[] = [];

  if (howTo.length > 0) {
    sections.push(`Sådan gør du:\n${howTo.map(line => `- ${line}`).join('\n')}`);
  }
  if (why) {
    sections.push(`Hvorfor værdifuldt:\n${why}`);
  }

  if (sections.length === 0) return null;
  return sections.join('\n\n');
}
