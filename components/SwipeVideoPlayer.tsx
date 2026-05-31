import React, { useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import SmartVideoPlayer from '@/components/SmartVideoPlayer';
import { normalizeTaskVideoUrls } from '@/utils/taskVideos';

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
  const videoUrls = useMemo(() => normalizeTaskVideoUrls(urls), [urls]);
  const [activeIndex, setActiveIndex] = useState(() => clampIndex(initialIndex, videoUrls.length));
  const [containerWidth, setContainerWidth] = useState(0);
  const { width } = useWindowDimensions();
  const slideWidth = Math.max(1, containerWidth || Math.min(width, 720));
  const hasMultipleVideos = videoUrls.length > 1;

  if (!videoUrls.length) return null;

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / slideWidth);
    setActiveIndex(clampIndex(nextIndex, videoUrls.length));
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
        contentOffset={{ x: clampIndex(initialIndex, videoUrls.length) * slideWidth, y: 0 }}
        scrollEnabled={hasMultipleVideos}
        testID={testID ? `${testID}.scroll` : undefined}
      >
        {videoUrls.map((url, index) => (
          <View key={`${url}-${index}`} style={[styles.slide, { width: slideWidth, minHeight }]}>
            <SmartVideoPlayer url={url} />
          </View>
        ))}
      </ScrollView>

      {hasMultipleVideos && showHint ? (
        <View style={styles.hintPill} pointerEvents="none">
          <Text style={styles.hintText}>Swipe for næste video</Text>
          <Text style={styles.counterText}>{activeIndex + 1}/{videoUrls.length}</Text>
        </View>
      ) : null}

      {hasMultipleVideos ? (
        <View style={styles.dots} pointerEvents="none">
          {videoUrls.map((url, index) => (
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
