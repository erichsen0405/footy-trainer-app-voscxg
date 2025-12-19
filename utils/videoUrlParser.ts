
/**
 * Video URL Parser Utility
 * Provides functions to parse and validate YouTube and Vimeo URLs
 * 
 * IMPORTANT: Only embed URLs should be loaded in WebView
 * - YouTube: https://www.youtube.com/embed/{videoId}
 * - Vimeo: https://player.vimeo.com/video/{videoId}
 * - Never load watch-page URLs
 */

export interface VideoInfo {
  platform: 'youtube' | 'vimeo' | 'unsupported';
  videoId: string | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
}

/**
 * Parse video URL and extract platform information
 * Converts any valid YouTube or Vimeo URL to proper embed format
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
  // Supports: youtube.com/watch?v=, youtu.be/, youtube.com/embed/, youtube.com/shorts/
  const youtubePatterns = [
    /(?:youtube\.com\/watch\?v=)([^&\n?#]+)/,
    /(?:youtu\.be\/)([^&\n?#]+)/,
    /(?:youtube\.com\/embed\/)([^&\n?#]+)/,
    /(?:youtube\.com\/shorts\/)([^&\n?#]+)/,
  ];

  for (const pattern of youtubePatterns) {
    const match = trimmedUrl.match(pattern);
    if (match && match[1]) {
      const videoId = match[1];
      // Always return embed URL format
      return {
        platform: 'youtube',
        videoId,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      };
    }
  }

  // Vimeo detection patterns
  // Supports: vimeo.com/{id}, vimeo.com/video/{id}, player.vimeo.com/video/{id}
  const vimeoPatterns = [
    /(?:vimeo\.com\/)(\d+)/,
    /(?:vimeo\.com\/video\/)(\d+)/,
    /(?:player\.vimeo\.com\/video\/)(\d+)/,
  ];

  for (const pattern of vimeoPatterns) {
    const match = trimmedUrl.match(pattern);
    if (match && match[1]) {
      const videoId = match[1];
      // Always return embed URL format
      return {
        platform: 'vimeo',
        videoId,
        embedUrl: `https://player.vimeo.com/video/${videoId}`,
        thumbnailUrl: null, // Vimeo thumbnails require API call
      };
    }
  }

  // URL is not a supported video platform
  return {
    platform: 'unsupported',
    videoId: null,
    embedUrl: null,
    thumbnailUrl: null,
  };
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
 * Check if URL is a valid video URL (YouTube or Vimeo)
 * Returns true only if the URL can be converted to a valid embed URL
 */
export function isValidVideoUrl(url: string): boolean {
  const videoInfo = parseVideoUrl(url);
  return videoInfo.platform !== 'unsupported' && videoInfo.videoId !== null && videoInfo.embedUrl !== null;
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
