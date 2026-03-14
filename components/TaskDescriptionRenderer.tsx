
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/styles/commonStyles';
import SmartVideoPlayer from '@/components/SmartVideoPlayer';
import { stripAfterTrainingMarkers } from '@/utils/afterTrainingMarkers';
import { extractFirstPlayableVideoUrl } from '@/utils/videoUrlParser';

interface TaskDescriptionRendererProps {
  description: string;
  textColor: string;
}

export function TaskDescriptionRenderer({ description, textColor }: TaskDescriptionRendererProps) {
  const sanitizedDescription = useMemo(() => {
    return stripAfterTrainingMarkers(description);
  }, [description]);

  const videoUrl = useMemo(() => {
    if (!sanitizedDescription) {
      return null;
    }
    return extractFirstPlayableVideoUrl(sanitizedDescription);
  }, [sanitizedDescription]);

  const textWithoutVideoUrl = useMemo(() => {
    if (!sanitizedDescription) return '';
    if (!videoUrl) return sanitizedDescription.trim();
    return sanitizedDescription.replace(videoUrl, '').trim();
  }, [sanitizedDescription, videoUrl]);

  if (!sanitizedDescription) {
    return null;
  }

  return (
    <View style={styles.container}>
      {videoUrl ? (
        <View style={styles.videoThumbnail}>
          <SmartVideoPlayer url={videoUrl} />
        </View>
      ) : null}
      {textWithoutVideoUrl ? (
        <Text style={[styles.text, { color: textColor }]}>
          {textWithoutVideoUrl}
        </Text>
      ) : null}
    </View>
  );
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
});
