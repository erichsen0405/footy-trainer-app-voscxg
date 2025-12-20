
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { isValidVideoUrl, parseVideoUrl } from '@/utils/videoUrlParser';
import { VideoModal, VideoThumbnail } from '@/components/VideoPlayer';

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
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);

  // CRITICAL FIX: Use useMemo to detect description changes and force re-render
  const videoUrl = useMemo(() => {
    if (!description || !description.trim()) {
      return null;
    }

    // CRITICAL FIX: Broader regex that matches ANY http(s) URL
    // This will match Supabase storage URLs, CDN URLs, YouTube, Vimeo, signed URLs, etc.
    const videoUrlRegex = /(https?:\/\/[^\s]+)/i;
    const match = description.match(videoUrlRegex);
    
    console.log('🔍 TaskDescriptionRenderer - Checking for video URL');
    console.log('📝 Description:', description.substring(0, 100));
    console.log('🎯 Regex match:', match ? match[0] : 'No match');
    
    return match ? match[0] : null;
  }, [description]);

  console.log('🎬 TaskDescriptionRenderer rendering');
  console.log('📹 Video URL found:', videoUrl);

  if (!description || !description.trim()) {
    return null;
  }

  // If we found a video URL, render the video player
  if (videoUrl) {
    console.log('✅ Rendering VideoPlayer with URL:', videoUrl);
    
    // CRITICAL FIX: key={videoUrl} forces unmount/remount when URL changes
    // This solves iOS tab screen caching issues
    return (
      <View style={styles.container}>
        <VideoThumbnail
          key={videoUrl}
          videoUrl={videoUrl}
          onPress={() => setSelectedVideoUrl(videoUrl)}
          style={styles.videoThumbnail}
        />
        <Text style={[styles.videoLabel, { color: textColor }]}>
          {getVideoLabel(videoUrl)}
        </Text>

        {/* Video Modal */}
        {selectedVideoUrl && (
          <VideoModal
            visible={!!selectedVideoUrl}
            videoUrl={selectedVideoUrl}
            onClose={() => setSelectedVideoUrl(null)}
            title="Opgave video"
          />
        )}
      </View>
    );
  }

  // No video URL found, render as regular text
  console.log('📝 No video URL found, rendering as text');
  return (
    <View style={styles.container}>
      <Text style={[styles.text, { color: textColor }]}>
        {description}
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
