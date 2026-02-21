
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { parseVideoUrl, isValidVideoUrl } from '@/utils/videoUrlParser';
import SmartVideoPlayer from '@/components/SmartVideoPlayer';
import { stripAfterTrainingMarkers } from '@/utils/afterTrainingMarkers';

interface TaskDescriptionRendererProps {
  description: string;
  textColor: string;
}

/**
 * TaskDescriptionRenderer Component
 * 
 * Parses task descriptions and renders:
 * - Regular text as Text components
 * - Video URLs as embedded video players
 * 
 * CRITICAL FIXES FOR iOS:
 * 1. Broader regex to match ANY http(s) URL (not just .mp4/.mov/.avi)
 * 2. useMemo to force re-render when description changes
 * 3. key prop on VideoPlayer to force unmount/remount (iOS cache fix)
 */
export function TaskDescriptionRenderer({ description, textColor }: TaskDescriptionRendererProps) {
  const sanitizedDescription = useMemo(() => {
    return stripAfterTrainingMarkers(description);
  }, [description]);

  // CRITICAL FIX: Use useMemo to detect description changes and force re-render
  const videoUrl = useMemo(() => {
    if (!sanitizedDescription) {
      return null;
    }

    // CRITICAL FIX: Broader regex that matches ANY http(s) URL
    // This will match Supabase storage URLs, CDN URLs, YouTube, Vimeo, signed URLs, etc.
    const videoUrlRegex = /(https?:\/\/[^\s]+)/i;
    const match = sanitizedDescription.match(videoUrlRegex);
    
    return match ? match[0] : null;
  }, [sanitizedDescription]);

  if (!sanitizedDescription) {
    return null;
  }

  // If we found a video URL, render the video player
  if (videoUrl && isValidVideoUrl(videoUrl)) {
    return (
      <View style={styles.container}>
        <View style={styles.videoThumbnail}>
          <SmartVideoPlayer url={videoUrl} />
        </View>
        <Text style={[styles.videoLabel, { color: textColor }]}>
          {getVideoLabel(videoUrl)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.text, { color: textColor }]}>
        {sanitizedDescription}
      </Text>
    </View>
  );
}

/**
 * Get a friendly label for the video URL
 */
function getVideoLabel(url: string): string {
  // Check if it's a known platform (YouTube/Vimeo)
  const videoInfo = parseVideoUrl(url);
  
  if (videoInfo.platform === 'youtube') {
    return '▶️ YouTube Video';
  } else if (videoInfo.platform === 'vimeo') {
    return '▶️ Vimeo Video';
  }
  
  // Generic video label for other URLs
  return '▶️ Video';
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  videoThumbnail: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  videoLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
});

