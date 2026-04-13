
/**
 * Video URL Parser Utility
 * Provides functions to parse and validate YouTube, Vimeo, and Instagram URLs
 * 
 * IMPORTANT: Only embed URLs should be loaded in WebView
 * - YouTube: https://www.youtube.com/embed/{videoId}
 * - Vimeo: https://player.vimeo.com/video/{videoId}
 * - Never load watch-page URLs
 */

export interface VideoInfo {
  platform: 'youtube' | 'vimeo' | 'instagram' | 'unsupported';
  videoId: string | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
}

const DIRECT_VIDEO_PATTERN = /\.(mp4|m4v|mov|webm|ogv|m3u8)(?:$|[?#])/i;

function safeParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
}

function sanitizeVideoId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseYouTubeVideoId(url: string): string | null {
  const parsed = safeParseUrl(url);
  if (parsed) {
    const host = normalizeHost(parsed.hostname);
    if (host === 'youtu.be') {
      return sanitizeVideoId(parsed.pathname.split('/').filter(Boolean)[0] ?? null);
    }

    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const fromQuery = sanitizeVideoId(parsed.searchParams.get('v'));
      if (fromQuery) return fromQuery;

      const segments = parsed.pathname.split('/').filter(Boolean);
      if (!segments.length) return null;

      if (segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'live') {
        return sanitizeVideoId(segments[1] ?? null);
      }
    }
  }

  const regexFallbacks = [
    /(?:youtu\.be\/)([^&\n?#/]+)/i,
    /(?:youtube(?:-nocookie)?\.com\/embed\/)([^&\n?#/]+)/i,
    /(?:youtube\.com\/shorts\/)([^&\n?#/]+)/i,
    /(?:youtube\.com\/live\/)([^&\n?#/]+)/i,
    /(?:[?&]v=)([^&\n?#/]+)/i,
  ];

  for (const pattern of regexFallbacks) {
    const match = url.match(pattern);
    if (match?.[1]) return sanitizeVideoId(match[1]);
  }

  return null;
}

function parseVimeoVideoId(url: string): string | null {
  const parsed = safeParseUrl(url);
  if (parsed) {
    const host = normalizeHost(parsed.hostname);
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const segments = parsed.pathname.split('/').filter(Boolean);
      const firstNumeric = segments.find(segment => /^\d+$/.test(segment));
      if (firstNumeric) return firstNumeric;
    }
  }

  const regexFallbacks = [
    /(?:player\.vimeo\.com\/video\/)(\d+)/i,
    /(?:vimeo\.com\/video\/)(\d+)/i,
    /(?:vimeo\.com\/)(\d+)/i,
  ];

  for (const pattern of regexFallbacks) {
    const match = url.match(pattern);
    if (match?.[1]) return sanitizeVideoId(match[1]);
  }

  return null;
}

function parseInstagramVideoId(url: string): string | null {
  const parsed = safeParseUrl(url);
  if (parsed) {
    const host = normalizeHost(parsed.hostname);
    if (host === 'instagram.com') {
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (!segments.length) return null;

      if (segments[0] === 'reel' || segments[0] === 'p' || segments[0] === 'tv') {
        return sanitizeVideoId(segments[1] ?? null);
      }
    }
  }

  const regexFallbacks = [
    /(?:instagram\.com\/reel\/)([^&\n?#/]+)/i,
    /(?:instagram\.com\/p\/)([^&\n?#/]+)/i,
    /(?:instagram\.com\/tv\/)([^&\n?#/]+)/i,
  ];

  for (const pattern of regexFallbacks) {
    const match = url.match(pattern);
    if (match?.[1]) return sanitizeVideoId(match[1]);
  }

  return null;
}

function buildInstagramThumbnailUrl(url: string, videoId: string): string | null {
  const parsed = safeParseUrl(url);
  if (parsed) {
    const host = normalizeHost(parsed.hostname);
    if (host === 'instagram.com') {
      const segments = parsed.pathname.split('/').filter(Boolean);
      const contentType = segments[0];
      if (contentType === 'reel' || contentType === 'p' || contentType === 'tv') {
        return `https://www.instagram.com/${contentType}/${videoId}/media/?size=l`;
      }
    }
  }

  if (/instagram\.com\/reel\//i.test(url)) {
    return `https://www.instagram.com/reel/${videoId}/media/?size=l`;
  }
  if (/instagram\.com\/tv\//i.test(url)) {
    return `https://www.instagram.com/tv/${videoId}/media/?size=l`;
  }
  return `https://www.instagram.com/p/${videoId}/media/?size=l`;
}

/**
 * Parse video URL and extract platform information
 * Converts supported URLs to platform metadata
 */
export function parseVideoUrl(url: string): VideoInfo {
  if (!url || !url.trim()) {
    return {
      platform: 'unsupported',
      videoId: null,
      embedUrl: null,
      thumbnailUrl: null,
    };
  }

  const trimmedUrl = url.trim();

  const youtubeId = parseYouTubeVideoId(trimmedUrl);
  if (youtubeId) {
    return {
      platform: 'youtube',
      videoId: youtubeId,
      embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    };
  }

  const vimeoId = parseVimeoVideoId(trimmedUrl);
  if (vimeoId) {
    return {
      platform: 'vimeo',
      videoId: vimeoId,
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
      thumbnailUrl: null,
    };
  }

  const instagramId = parseInstagramVideoId(trimmedUrl);
  if (instagramId) {
    return {
      platform: 'instagram',
      videoId: instagramId,
      embedUrl: null,
      thumbnailUrl: buildInstagramThumbnailUrl(trimmedUrl, instagramId),
    };
  }

  return {
    platform: 'unsupported',
    videoId: null,
    embedUrl: null,
    thumbnailUrl: null,
  };
}

export function isDirectVideoUrl(url: string): boolean {
  if (!url || !url.trim()) return false;
  return DIRECT_VIDEO_PATTERN.test(url.trim());
}

export function isPlayableVideoUrl(url: string): boolean {
  if (!url || !url.trim()) return false;
  if (isDirectVideoUrl(url)) return true;
  const videoInfo = parseVideoUrl(url);
  return videoInfo.platform !== 'unsupported' && videoInfo.videoId !== null;
}

export function extractFirstPlayableVideoUrl(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const matches = value.match(/https?:\/\/[^\s]+/gi) ?? [];
  for (const candidate of matches) {
    if (isPlayableVideoUrl(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Get video thumbnail URL
 * Returns null if thumbnail is not available (e.g., Vimeo)
 */
export function getVideoThumbnail(url: string): string | null {
  const videoInfo = parseVideoUrl(url);
  return videoInfo.thumbnailUrl;
}

/**
 * Check if URL is a supported video URL (YouTube, Vimeo, or Instagram)
 */
export function isValidVideoUrl(url: string): boolean {
  const videoInfo = parseVideoUrl(url);
  return videoInfo.platform !== 'unsupported' && videoInfo.videoId !== null;
}

/**
 * Get platform name from URL
 */
export function getVideoPlatform(url: string): 'youtube' | 'vimeo' | 'instagram' | 'unsupported' {
  const videoInfo = parseVideoUrl(url);
  return videoInfo.platform;
}

/**
 * Get video ID from URL
 */
export function getVideoId(url: string): string | null {
  const videoInfo = parseVideoUrl(url);
  return videoInfo.videoId;
}

/**
 * Get embed URL from video URL
 * This is the URL that should be loaded in WebView
 * Returns null if URL cannot be converted to embed format
 */
export function getEmbedUrl(url: string): string | null {
  const videoInfo = parseVideoUrl(url);
  return videoInfo.embedUrl;
}

/**
 * Validate that a URL is in proper embed format
 * Returns true if URL is already an embed URL
 */
export function isEmbedUrl(url: string): boolean {
  if (!url) return false;
  
  const trimmedUrl = url.trim();
  
  // Check if it's a YouTube embed URL
  if (trimmedUrl.includes('youtube.com/embed/')) {
    return true;
  }
  
  // Check if it's a Vimeo embed URL
  if (trimmedUrl.includes('player.vimeo.com/video/')) {
    return true;
  }
  
  return false;
}
