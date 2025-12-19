
import React, { useState } from 'react';
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
 * Supports YouTube and Vimeo URLs anywhere in the description
 */
export function TaskDescriptionRenderer({ description, textColor }: TaskDescriptionRendererProps) {
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);

  if (!description || !description.trim()) {
    return null;
  }

  // Parse the description to find video URLs
  const parts = parseDescriptionWithVideos(description);

  return (
    <View style={styles.container}>
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return (
            <Text 
              key={`text-${index}`} 
              style={[styles.text, { color: textColor }]}
            >
              {part.content}
            </Text>
          );
        } else if (part.type === 'video') {
          return (
            <View key={`video-${index}`} style={styles.videoContainer}>
              <VideoThumbnail
                videoUrl={part.content}
                onPress={() => setSelectedVideoUrl(part.content)}
                style={styles.videoThumbnail}
              />
              <Text style={[styles.videoLabel, { color: textColor }]}>
                {getVideoLabel(part.content)}
              </Text>
            </View>
          );
        }
        return null;
      })}

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

/**
 * Parse description text and extract video URLs
 */
interface DescriptionPart {
  type: 'text' | 'video';
  content: string;
}

function parseDescriptionWithVideos(description: string): DescriptionPart[] {
  const parts: DescriptionPart[] = [];
  
  // Regular expressions for detecting video URLs
  const urlPatterns = [
    // YouTube patterns
    /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]+/gi,
    /https?:\/\/(?:www\.)?youtu\.be\/[\w-]+/gi,
    /https?:\/\/(?:www\.)?youtube\.com\/embed\/[\w-]+/gi,
    /https?:\/\/(?:www\.)?youtube\.com\/shorts\/[\w-]+/gi,
    // Vimeo patterns
    /https?:\/\/(?:www\.)?vimeo\.com\/\d+/gi,
    /https?:\/\/(?:www\.)?vimeo\.com\/video\/\d+/gi,
    /https?:\/\/player\.vimeo\.com\/video\/\d+/gi,
  ];

  let remainingText = description;
  let lastIndex = 0;

  // Find all video URLs in the description
  const matches: Array<{ url: string; index: number }> = [];
  
  for (const pattern of urlPatterns) {
    let match;
    while ((match = pattern.exec(description)) !== null) {
      const url = match[0];
      if (isValidVideoUrl(url)) {
        matches.push({ url, index: match.index });
      }
    }
  }

  // Sort matches by index
  matches.sort((a, b) => a.index - b.index);

  // Remove duplicates (same URL at same position)
  const uniqueMatches = matches.filter((match, index, self) => 
    index === 0 || match.index !== self[index - 1].index
  );

  // Build parts array
  if (uniqueMatches.length === 0) {
    // No videos found, return entire description as text
    return [{ type: 'text', content: description }];
  }

  uniqueMatches.forEach((match, index) => {
    // Add text before this video URL
    if (match.index > lastIndex) {
      const textBefore = description.substring(lastIndex, match.index).trim();
      if (textBefore) {
        parts.push({ type: 'text', content: textBefore });
      }
    }

    // Add video URL
    parts.push({ type: 'video', content: match.url });

    // Update lastIndex
    lastIndex = match.index + match.url.length;

    // Add remaining text after last video
    if (index === uniqueMatches.length - 1 && lastIndex < description.length) {
      const textAfter = description.substring(lastIndex).trim();
      if (textAfter) {
        parts.push({ type: 'text', content: textAfter });
      }
    }
  });

  return parts;
}

/**
 * Get a friendly label for the video URL
 */
function getVideoLabel(url: string): string {
  const videoInfo = parseVideoUrl(url);
  
  if (videoInfo.platform === 'youtube') {
    return '▶️ YouTube Video';
  } else if (videoInfo.platform === 'vimeo') {
    return '▶️ Vimeo Video';
  }
  
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
  videoContainer: {
    marginVertical: 8,
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
