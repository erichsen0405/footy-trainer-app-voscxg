import { extractFirstPlayableVideoUrl, isPlayableVideoUrl } from '@/utils/videoUrlParser';
import { reorderTaskMediaUrls } from '@/utils/taskMediaOrder';

export type TaskMediaType = 'video' | 'image' | 'pdf' | 'unknown';

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extensionFromUrl(value: string): string | null {
  const withoutQuery = value.split('?')[0]?.split('#')[0] ?? value;
  const match = withoutQuery.match(/\.([a-zA-Z0-9]+)$/);
  return match?.[1]?.toLowerCase() ?? null;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function getTaskMediaType(value: unknown): TaskMediaType {
  const url = trimString(value);
  if (!url) return 'unknown';
  if (isPlayableVideoUrl(url)) return 'video';
  if (!isHttpUrl(url)) return 'unknown';

  const extension = extensionFromUrl(url);
  if (extension === 'jpg' || extension === 'jpeg' || extension === 'png') return 'image';
  if (extension === 'pdf') return 'pdf';

  return 'unknown';
}

export function isTaskMediaUrl(value: unknown): boolean {
  return getTaskMediaType(value) !== 'unknown';
}

export function normalizeTaskVideoUrls(value: unknown): string[] {
  const rawValues: unknown[] = [];
  collectRawValues(value, rawValues);

  const seen = new Set<string>();
  const urls: string[] = [];

  rawValues.forEach((raw) => {
    const url = trimString(raw);
    if (!url || !isTaskMediaUrl(url)) return;
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

export function getDefaultTaskMediaName(index: number): string {
  return `Media ${Math.max(0, Math.round(index)) + 1}`;
}

export function getTaskMediaNameFromFileName(value: unknown): string {
  const fileName = typeof value === 'string' ? value.trim().split('/').pop() ?? '' : '';
  const withoutExtension = fileName.replace(/\.[^/.]+$/, '');
  const withoutUploadSuffix = withoutExtension.replace(/-\d{13}-[a-z0-9]{8}$/i, '');
  return withoutUploadSuffix.replace(/[-_]+/g, ' ').trim();
}

function normalizeTaskMediaNameValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeTaskMediaNames(names: unknown, urls: unknown): string[] {
  const normalizedUrls = normalizeTaskVideoUrls(urls);
  if (!normalizedUrls.length) return [];

  const rawNames = Array.isArray(names)
    ? names
    : typeof names === 'string' && names.trim().startsWith('[')
      ? safelyParseArray(names)
      : [];

  return normalizedUrls.map((_, index) => {
    const normalizedName = normalizeTaskMediaNameValue(rawNames[index]);
    return normalizedName || getDefaultTaskMediaName(index);
  });
}

export function buildTaskMediaNamePayload(
  names: unknown,
  urls: unknown,
): {
  mediaNames: string[];
  media_names: string[] | null;
} {
  const normalizedUrls = normalizeTaskVideoUrls(urls);
  const mediaNames = normalizeTaskMediaNames(names, normalizedUrls);

  return {
    mediaNames,
    media_names: normalizedUrls.length ? mediaNames : null,
  };
}

export function mergeTaskMedia(
  existingUrls: unknown,
  existingNames: unknown,
  nextUrl: unknown,
  nextName?: unknown,
): { urls: string[]; names: string[] } {
  const urls = normalizeTaskVideoUrls(existingUrls);
  const names = normalizeTaskMediaNames(existingNames, urls);
  const incomingUrls = normalizeTaskVideoUrls(nextUrl);
  const incomingName = normalizeTaskMediaNameValue(nextName);

  incomingUrls.forEach((url) => {
    const duplicateIndex = urls.findIndex((existingUrl) => existingUrl.toLowerCase() === url.toLowerCase());
    if (duplicateIndex >= 0) return;

    urls.push(url);
    names.push(incomingName || getDefaultTaskMediaName(urls.length - 1));
  });

  return {
    urls,
    names: normalizeTaskMediaNames(names, urls),
  };
}

export function reorderTaskMedia(
  urls: unknown,
  names: unknown,
  fromIndex: number,
  toIndex: number,
): { urls: string[]; names: string[] } {
  const normalizedUrls = normalizeTaskVideoUrls(urls);
  const normalizedNames = normalizeTaskMediaNames(names, normalizedUrls);

  return {
    urls: reorderTaskMediaUrls(normalizedUrls, fromIndex, toIndex),
    names: reorderTaskMediaUrls(normalizedNames, fromIndex, toIndex),
  };
}

export function replaceTaskMediaName(
  names: unknown,
  urls: unknown,
  index: number,
  nextName: unknown,
): string[] {
  const normalizedUrls = normalizeTaskVideoUrls(urls);
  const nextNames = normalizeTaskMediaNames(names, normalizedUrls);
  if (!Number.isInteger(index) || index < 0 || index >= nextNames.length) return nextNames;

  const normalizedName = normalizeTaskMediaNameValue(nextName);
  nextNames[index] = normalizedName || getDefaultTaskMediaName(index);
  return nextNames;
}

export function removeTaskMediaAt(
  urls: unknown,
  names: unknown,
  index: number,
): { urls: string[]; names: string[] } {
  const normalizedUrls = normalizeTaskVideoUrls(urls);
  const normalizedNames = normalizeTaskMediaNames(names, normalizedUrls);
  if (!Number.isInteger(index) || index < 0 || index >= normalizedUrls.length) {
    return { urls: normalizedUrls, names: normalizedNames };
  }

  const nextUrls = normalizedUrls.filter((_, currentIndex) => currentIndex !== index);
  const nextNames = normalizedNames.filter((_, currentIndex) => currentIndex !== index);
  return {
    urls: nextUrls,
    names: normalizeTaskMediaNames(nextNames, nextUrls),
  };
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
