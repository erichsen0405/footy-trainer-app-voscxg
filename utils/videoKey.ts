const DEFAULT_SUPABASE_URL = 'https://lhpczofddvwcyrgotzha.supabase.co';
const DEFAULT_VIDEO_BUCKET = 'drill-videos';
const KNOWN_STORAGE_BUCKETS = new Set<string>([DEFAULT_VIDEO_BUCKET, 'exercise-videos', 'exercise-thumbnails']);
const PUBLIC_STORAGE_SEGMENT = '/storage/v1/object/public/';

function trimOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function stripQueryAndHash(value: string): string {
  const hashIndex = value.indexOf('#');
  const queryIndex = value.indexOf('?');
  const cutAt =
    hashIndex >= 0 && queryIndex >= 0
      ? Math.min(hashIndex, queryIndex)
      : hashIndex >= 0
      ? hashIndex
      : queryIndex;
  return cutAt >= 0 ? value.slice(0, cutAt) : value;
}

function stripLeadingSlashes(value: string): string {
  return value.replace(/^\/+/, '');
}

function encodePathSegments(value: string): string {
  return value
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

function getPublicStorageBaseUrl(): string {
  const envUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const base = envUrl || DEFAULT_SUPABASE_URL;
  return `${base}${PUBLIC_STORAGE_SEGMENT}`;
}

function splitBucketAndPath(rawKey: string): { bucket: string; path: string } {
  const cleaned = stripLeadingSlashes(stripQueryAndHash(rawKey));
  const parts = cleaned.split('/').filter(Boolean);

  if (parts.length >= 2 && KNOWN_STORAGE_BUCKETS.has(parts[0])) {
    return {
      bucket: parts[0],
      path: parts.slice(1).join('/'),
    };
  }

  return {
    bucket: DEFAULT_VIDEO_BUCKET,
    path: cleaned,
  };
}

export function extractVideoKey(videoUrlOrKey: unknown): string | null {
  const raw = trimOrNull(videoUrlOrKey);
  if (!raw) return null;

  const publicIdx = raw.indexOf(PUBLIC_STORAGE_SEGMENT);
  if (publicIdx >= 0) {
    const keyPart = stripQueryAndHash(raw.slice(publicIdx + PUBLIC_STORAGE_SEGMENT.length));
    const sanitized = stripLeadingSlashes(keyPart);
    let decoded = sanitized;
    try {
      decoded = decodeURIComponent(sanitized);
    } catch {
      // Keep the raw path segment if URL encoding is malformed.
      decoded = sanitized;
    }
    return decoded || null;
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  return stripLeadingSlashes(raw);
}

export function resolveVideoUrl(videoUrlOrKey: unknown): string | null {
  const raw = trimOrNull(videoUrlOrKey);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;

  const { bucket, path } = splitBucketAndPath(raw);
  if (!path) return null;

  const encodedKey = `${encodeURIComponent(bucket)}/${encodePathSegments(path)}`;
  return `${getPublicStorageBaseUrl()}${encodedKey}`;
}
