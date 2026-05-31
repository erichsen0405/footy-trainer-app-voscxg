import { extractFirstPlayableVideoUrl, isPlayableVideoUrl } from '@/utils/videoUrlParser';

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeTaskVideoUrls(value: unknown): string[] {
  const rawValues: unknown[] = [];
  collectRawValues(value, rawValues);

  const seen = new Set<string>();
  const urls: string[] = [];

  rawValues.forEach((raw) => {
    const url = trimString(raw);
    if (!url || !isPlayableVideoUrl(url)) return;
    const key = url.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    urls.push(url);
  });

  return urls;
}

export function getTaskVideoUrls(task: any): string[] {
  if (!task) return [];

  const fromPlural = normalizeTaskVideoUrls(task.videoUrls ?? task.video_urls);
  const fromSingle = normalizeTaskVideoUrls(task.videoUrl ?? task.video_url);
  const fromDescription = normalizeTaskVideoUrls(extractFirstPlayableVideoUrl(task.description));

  return normalizeTaskVideoUrls([...fromPlural, ...fromSingle, ...fromDescription]);
}

export function getPrimaryTaskVideoUrl(task: any): string | null {
  return getTaskVideoUrls(task)[0] ?? null;
}

export function buildTaskVideoPayload(urls: unknown): {
  videoUrl: string | null;
  videoUrls: string[];
  video_url: string | null;
  video_urls: string[] | null;
} {
  const normalizedUrls = normalizeTaskVideoUrls(urls);
  const primaryUrl = normalizedUrls[0] ?? null;

  return {
    videoUrl: primaryUrl,
    videoUrls: normalizedUrls,
    video_url: primaryUrl,
    video_urls: normalizedUrls.length ? normalizedUrls : null,
  };
}

export function mergeTaskVideoUrls(existingUrls: unknown, nextUrl: unknown): string[] {
  return normalizeTaskVideoUrls([...normalizeTaskVideoUrls(existingUrls), ...normalizeTaskVideoUrls(nextUrl)]);
}

function safelyParseArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function collectRawValues(value: unknown, out: unknown[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRawValues(item, out));
    return;
  }

  if (typeof value === 'string' && value.trim().startsWith('[')) {
    safelyParseArray(value).forEach((item) => collectRawValues(item, out));
    return;
  }

  if (value) {
    out.push(value);
  }
}
