
/**
 * Video URL Parser Utility
 * Provides functions to parse and validate YouTube and Vimeo URLs
 */

export interface VideoInfo {
  platform: 'youtube' | 'vimeo' | 'unsupported';
  videoId: string | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
}

/**
 * Parse video URL and extract platform information
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

  // YouTube detection patterns
  const youtubePatterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ];

  for (const pattern of youtubePatterns) {
    const match = trimmedUrl.match(pattern);
    if (match && match[1]) {
      const videoId = match[1];
      return {
        platform: 'youtube',
        videoId,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      };
    }
  }

  // Vimeo detection patterns
  const vimeoPatterns = [
    /vimeo\.com\/(\d+)/,
    /vimeo\.com\/video\/(\d+)/,
    /player\.vimeo\.com\/video\/(\d+)/,
  ];

  for (const pattern of vimeoPatterns) {
    const match = trimmedUrl.match(pattern);
    if (match && match[1]) {
      const videoId = match[1];
      return {
        platform: 'vimeo',
        videoId,
        embedUrl: `https://player.vimeo.com/video/${videoId}`,
        thumbnailUrl: null, // Vimeo thumbnails require API call
      };
    }
  }

  return {
    platform: 'unsupported',
    videoId: null,
    embedUrl: null,
    thumbnailUrl: null,
  };
}

/**
 * Get video thumbnail URL
 */
export function getVideoThumbnail(url: string): string | null {
  const videoInfo = parseVideoUrl(url);
  return videoInfo.thumbnailUrl;
}

/**
 * Check if URL is a valid video URL (YouTube or Vimeo)
 */
export function isValidVideoUrl(url: string): boolean {
  const videoInfo = parseVideoUrl(url);
  return videoInfo.platform !== 'unsupported' && videoInfo.videoId !== null;
}

/**
 * Get platform name from URL
 */
export function getVideoPlatform(url: string): 'youtube' | 'vimeo' | 'unsupported' {
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
 */
export function getEmbedUrl(url: string): string | null {
  const videoInfo = parseVideoUrl(url);
  return videoInfo.embedUrl;
}
