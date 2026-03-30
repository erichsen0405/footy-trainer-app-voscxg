
import React, { useEffect, useMemo, useState } from 'react';
import { View, Image, Pressable, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Linking from 'expo-linking';
import { resolveVideoUrl } from '@/utils/videoKey';
import { isDirectVideoUrl, parseVideoUrl } from '@/utils/videoUrlParser';

export default function SmartVideoPlayer({ url }: { url?: string }) {
  const [playVimeo, setPlayVimeo] = useState(false);

  const resolvedUrl = useMemo(() => resolveVideoUrl(url), [url]);
  const parsedVideo = useMemo(
    () => (resolvedUrl && /^https?:\/\//i.test(resolvedUrl) ? parseVideoUrl(resolvedUrl) : null),
    [resolvedUrl]
  );
  const youtubeId = parsedVideo?.platform === 'youtube' ? parsedVideo.videoId : null;
  const vimeoId = parsedVideo?.platform === 'vimeo' ? parsedVideo.videoId : null;
  const instagramUrl = parsedVideo?.platform === 'instagram' ? resolvedUrl : null;
  const inlineVideoHtml = useMemo(() => {
    if (!resolvedUrl || !isDirectVideoUrl(resolvedUrl)) return null;
    return buildVideoHtml(resolvedUrl);
  }, [resolvedUrl]);
  const vimeoHtml = useMemo(() => {
    if (!resolvedUrl || !vimeoId) return null;
    return buildVideoHtml(resolvedUrl, playVimeo);
  }, [playVimeo, resolvedUrl, vimeoId]);
  const thumbnailUrl = useMemo(() => {
    if (parsedVideo?.platform === 'youtube') return parsedVideo.thumbnailUrl;
    if (parsedVideo?.platform === 'vimeo' && vimeoId) return `https://vumbnail.com/${vimeoId}.jpg`;
    return null;
  }, [parsedVideo, vimeoId]);

  useEffect(() => {
    setPlayVimeo(false);
  }, [resolvedUrl]);

  if (!resolvedUrl) return null;

  if (youtubeId && thumbnailUrl) {
    return (
      <Thumb
        img={thumbnailUrl}
        onPress={() => Linking.openURL(resolvedUrl)}
        testID="smart-video-player.thumbnail"
      />
    );
  }

  if (vimeoHtml && thumbnailUrl) {
    return (
      <View style={styles.vimeoContainer}>
        <View
          pointerEvents={playVimeo ? 'none' : 'auto'}
          style={[styles.thumbnailOverlay, { opacity: playVimeo ? 0 : 1 }]}
        >
          <Thumb
            img={thumbnailUrl}
            onPress={() => setPlayVimeo(true)}
            testID="smart-video-player.thumbnail"
          />
        </View>

        <View
          pointerEvents={playVimeo ? 'auto' : 'none'}
          style={[styles.webViewContainer, { opacity: playVimeo ? 1 : 0, height: playVimeo ? 220 : 0 }]}
        >
          <WebView
            testID="smart-video-player.webview"
            source={{ html: vimeoHtml }}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            scrollEnabled={false}
            bounces={false}
            style={styles.webView}
          />
        </View>
      </View>
    );
  }

  if (inlineVideoHtml) {
    return (
      <View style={styles.directVideoContainer}>
        <WebView
          testID="smart-video-player.webview"
          source={{ html: inlineVideoHtml }}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          scrollEnabled={false}
          bounces={false}
          style={styles.webView}
        />
      </View>
    );
  }

  if (instagramUrl) {
    return (
      <Pressable
        onPress={() => Linking.openURL(instagramUrl)}
        style={styles.externalLinkCard}
        testID="smart-video-player.external-link"
      >
        <View style={styles.externalLinkBadge}>
          <Text style={styles.externalLinkBadgeText}>Instagram</Text>
        </View>
        <Text style={styles.externalLinkTitle}>Aabn Instagram-video</Text>
        <Text style={styles.externalLinkSubtitle} numberOfLines={1}>
          {instagramUrl}
        </Text>
      </Pressable>
    );
  }

  return null;
}

/* helpers */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildVideoHtml(videoUrl: string, autoPlay = false): string {
  const parsedVideo = parseVideoUrl(videoUrl);
  const youtubeId = parsedVideo.platform === 'youtube' ? parsedVideo.videoId : null;
  const vimeoId = parsedVideo.platform === 'vimeo' ? parsedVideo.videoId : null;
  const embedUrl = youtubeId
    ? `https://www.youtube.com/embed/${youtubeId}?autoplay=${autoPlay ? 1 : 0}&playsinline=1&rel=0`
    : vimeoId
      ? `https://player.vimeo.com/video/${vimeoId}?autoplay=${autoPlay ? 1 : 0}&playsinline=1`
      : null;

  if (embedUrl) {
    const safeEmbedUrl = escapeHtml(embedUrl);
    return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: #000;
      }
      iframe {
        width: 100%;
        height: 100%;
        border: 0;
        background: #000;
      }
    </style>
  </head>
  <body>
    <iframe src="${safeEmbedUrl}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
  </body>
</html>`;
  }

  const safeVideoUrl = escapeHtml(videoUrl);
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: #000;
      }
      video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: #000;
      }
    </style>
  </head>
  <body>
    <video controls playsinline webkit-playsinline preload="metadata">
      <source src="${safeVideoUrl}" />
    </video>
  </body>
</html>`;
}

/* ui */
const Thumb = ({ img, onPress, testID }: any) => (
  <Pressable onPress={onPress} style={styles.thumbContainer} testID={testID}>
    <Image
      source={{ uri: img }}
      style={styles.thumbImage}
      resizeMode="cover"
    />
    <View style={styles.playButtonOverlay}>
      <View style={styles.playButton}>
        <Text style={styles.playIcon}>▶</Text>
      </View>
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  vimeoContainer: {
    height: 220,
    backgroundColor: '#000',
    position: 'relative',
  },
  directVideoContainer: {
    height: 220,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  thumbnailOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  webViewContainer: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
    backgroundColor: '#000',
  },
  thumbContainer: {
    height: 220,
    width: '100%',
  },
  thumbImage: {
    height: 220,
    width: '100%',
  },
  externalLinkCard: {
    height: 220,
    borderRadius: 16,
    backgroundColor: '#111827',
    paddingHorizontal: 20,
    paddingVertical: 18,
    justifyContent: 'center',
    gap: 10,
  },
  externalLinkBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#E1306C',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  externalLinkBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  externalLinkTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  externalLinkSubtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
  },
  playButtonOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    color: '#fff',
    fontSize: 24,
  },
});
