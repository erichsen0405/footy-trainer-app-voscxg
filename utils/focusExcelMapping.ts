export type FocusMetadataRow = {
  id: string;
  title: string;
  difficulty: number;
  position: string;
  how_to: string[];
  why_valuable: string;
  filename: string | null;
  drejebog: string | null;
  video_key: string | null;
};

export type FocusSyncPlan = {
  nextRows: FocusMetadataRow[];
  updated: FocusMetadataRow[];
  created: FocusMetadataRow[];
  updatedIds: string[];
  createdIds: string[];
};

function toStringValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function clampDifficulty(value: unknown): number {
  const raw = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(5, Math.round(raw)));
}

export function parseHowToCell(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => toStringValue(item)).filter(Boolean);
  }

  const asText = toStringValue(value);
  if (!asText) return [];

  try {
    const parsed = JSON.parse(asText);
    if (Array.isArray(parsed)) {
      return parsed.map(item => toStringValue(item)).filter(Boolean);
    }
  } catch {
    // Continue with line-based fallback.
  }

  return asText
    .split(/\r?\n|\s*\|\s*/)
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

export function serializeHowToCell(value: string[]): string {
  return JSON.stringify(value || []);
}

export function normalizeFocusMetadataRow(raw: Record<string, unknown>): FocusMetadataRow | null {
  const id = toStringValue(raw.id);
  const title = toStringValue(raw.title);

  if (!id || !title) return null;

  const videoKeyRaw = toStringValue(raw.video_key ?? raw.video_url);
  const filenameRaw = toStringValue(raw.filename);
  const drejebogRaw = toStringValue(raw.drejebog);

  return {
    id,
    title,
    difficulty: clampDifficulty(raw.difficulty),
    position: toStringValue(raw.position),
    how_to: parseHowToCell(raw.how_to),
    why_valuable: toStringValue(raw.why_valuable),
    filename: filenameRaw || null,
    drejebog: drejebogRaw || null,
    video_key: videoKeyRaw || null,
  };
}

export function planFocusMetadataSync(existingRows: FocusMetadataRow[], incomingRows: FocusMetadataRow[]): FocusSyncPlan {
  const existingById = new Map(existingRows.map(row => [row.id, row]));
  const nextRows = [...existingRows];
  const nextIndexById = new Map(nextRows.map((row, index) => [row.id, index]));

  const updated: FocusMetadataRow[] = [];
  const created: FocusMetadataRow[] = [];

  incomingRows.forEach(incoming => {
    const existing = existingById.get(incoming.id);

    if (existing) {
      const merged: FocusMetadataRow = {
        ...existing,
        ...incoming,
      };
      const idx = nextIndexById.get(incoming.id);
      if (typeof idx === 'number') {
        nextRows[idx] = merged;
      }
      updated.push(merged);
      return;
    }

    nextRows.push(incoming);
    nextIndexById.set(incoming.id, nextRows.length - 1);
    created.push(incoming);
  });

  return {
    nextRows,
    updated,
    created,
    updatedIds: updated.map(row => row.id),
    createdIds: created.map(row => row.id),
  };
}
