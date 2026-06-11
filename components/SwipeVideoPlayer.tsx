import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  LayoutChangeEvent,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { IconSymbol } from '@/components/IconSymbol';
import SmartVideoPlayer from '@/components/SmartVideoPlayer';
import { getTaskMediaType, normalizeTaskVideoUrls } from '@/utils/taskVideos';

type SwipeVideoPlayerProps = {
  urls: unknown;
  initialIndex?: number;
  minHeight?: number;
  showHint?: boolean;
  testID?: string;
};

export default function SwipeVideoPlayer({
  urls,
  initialIndex = 0,
  minHeight = 220,
  showHint = true,
  testID,
}: SwipeVideoPlayerProps) {
  const mediaUrls = useMemo(() => normalizeTaskVideoUrls(urls), [urls]);
  const [activeIndex, setActiveIndex] = useState(() => clampIndex(initialIndex, mediaUrls.length));
  const [containerWidth, setContainerWidth] = useState(0);
  const { width } = useWindowDimensions();
  const slideWidth = Math.max(1, containerWidth || Math.min(width, 720));
  const hasMultipleMedia = mediaUrls.length > 1;

  useEffect(() => {
    setActiveIndex((current) => clampIndex(current, mediaUrls.length));
  }, [mediaUrls.length]);

  if (!mediaUrls.length) return null;

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / slideWidth);
    setActiveIndex(clampIndex(nextIndex, mediaUrls.length));
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth > 0 && nextWidth !== containerWidth) {
      setContainerWidth(nextWidth);
    }
  };

  return (
    <View style={[styles.wrapper, { minHeight }]} onLayout={handleLayout} testID={testID}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        contentOffset={{ x: clampIndex(initialIndex, mediaUrls.length) * slideWidth, y: 0 }}
        scrollEnabled={hasMultipleMedia}
        testID={testID ? `${testID}.scroll` : undefined}
      >
        {mediaUrls.map((url, index) => (
          <View key={`${url}-${index}`} style={[styles.slide, { width: slideWidth, minHeight }]}>
            <TaskMediaSlide url={url} />
          </View>
        ))}
      </ScrollView>

      {hasMultipleMedia && showHint ? (
        <View style={styles.hintPill} pointerEvents="none">
          <Text style={styles.hintText}>Swipe for next file</Text>
          <Text style={styles.counterText}>{activeIndex + 1}/{mediaUrls.length}</Text>
        </View>
      ) : null}

      {hasMultipleMedia ? (
        <View style={styles.dots} pointerEvents="none">
          {mediaUrls.map((url, index) => (
            <View
              key={`dot-${url}-${index}`}
              style={[styles.dot, index === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TaskMediaSlide({ url }: { url: string }) {
  const mediaType = getTaskMediaType(url);

  if (mediaType === 'image') {
    return <Image source={{ uri: url }} style={styles.image} resizeMode="contain" />;
  }

  if (mediaType === 'pdf') {
    return (
      <Pressable
        style={styles.pdfSlide}
        onPress={() => Linking.openURL(url)}
        accessibilityRole="button"
        accessibilityLabel="Open PDF"
      >
        <View style={styles.pdfIconWrap}>
          <IconSymbol ios_icon_name="doc.fill" android_material_icon_name="picture_as_pdf" size={34} color="#fff" />
        </View>
        <Text style={styles.pdfTitle}>PDF</Text>
        <Text style={styles.pdfSubtitle}>Open PDF</Text>
      </Pressable>
    );
  }

  return <SmartVideoPlayer url={url} />;
}

function clampIndex(index: number, length: number): number {
  if (!length) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.round(index)), length - 1);
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  slide: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  image: {
    width: '100%',
    height: '100%',
    minHeight: 220,
    backgroundColor: '#000',
  },
  pdfSlide: {
    width: '100%',
    minHeight: 220,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111827',
  },
  pdfIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdfTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
  },
  pdfSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    fontWeight: '700',
  },
  hintPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hintText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  counterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  dots: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  dotActive: {
    width: 18,
    backgroundColor: '#fff',
  },
});
