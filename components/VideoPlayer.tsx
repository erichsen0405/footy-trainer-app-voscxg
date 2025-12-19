
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  Linking,
  Alert,
  Image,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';

interface VideoPlayerProps {
  videoUrl: string;
  onClose?: () => void;
}

interface VideoInfo {
  platform: 'youtube' | 'vimeo' | 'unsupported';
  videoId: string | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
}

/**
 * Parse video URL and extract platform, video ID, and generate embed URL
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
 * Check if URL is a valid video URL
 */
export function isValidVideoUrl(url: string): boolean {
  const videoInfo = parseVideoUrl(url);
  return videoInfo.platform !== 'unsupported' && videoInfo.videoId !== null;
}

/**
 * Video Player Component
 * Supports YouTube and Vimeo with inline playback
 */
export function VideoPlayer({ videoUrl, onClose }: VideoPlayerProps) {
  const [webViewError, setWebViewError] = useState(false);
  const videoInfo = parseVideoUrl(videoUrl);

  if (videoInfo.platform === 'unsupported' || !videoInfo.embedUrl) {
    return (
      <View style={styles.errorContainer}>
        <IconSymbol
          ios_icon_name="exclamationmark.triangle.fill"
          android_material_icon_name="error"
          size={64}
          color="#FF0000"
        />
        <Text style={styles.errorTitle}>Ugyldig video URL</Text>
        <Text style={styles.errorText}>
          Kun YouTube og Vimeo links understøttes.
        </Text>
        {onClose && (
          <TouchableOpacity style={styles.closeErrorButton} onPress={onClose}>
            <Text style={styles.closeErrorButtonText}>Luk</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const openInExternalApp = () => {
    let externalUrl = videoUrl;
    
    if (videoInfo.platform === 'youtube' && videoInfo.videoId) {
      externalUrl = `https://www.youtube.com/watch?v=${videoInfo.videoId}`;
    } else if (videoInfo.platform === 'vimeo' && videoInfo.videoId) {
      externalUrl = `https://vimeo.com/${videoInfo.videoId}`;
    }

    Linking.openURL(externalUrl).catch(err => {
      console.error('Error opening video in external app:', err);
      Alert.alert('Fejl', 'Kunne ikke åbne video');
    });
  };

  const generateEmbedHTML = () => {
    if (videoInfo.platform === 'youtube') {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>
              * { margin: 0; padding: 0; }
              html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
              .video-container { position: relative; width: 100%; height: 100%; }
              iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; }
            </style>
          </head>
          <body>
            <div class="video-container">
              <iframe
                src="${videoInfo.embedUrl}?autoplay=1&playsinline=1&rel=0&modestbranding=1&fs=1&controls=1"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowfullscreen
              ></iframe>
            </div>
          </body>
        </html>
      `;
    } else if (videoInfo.platform === 'vimeo') {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>
              * { margin: 0; padding: 0; }
              html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
              .video-container { position: relative; width: 100%; height: 100%; }
              iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; }
            </style>
          </head>
          <body>
            <div class="video-container">
              <iframe
                src="${videoInfo.embedUrl}?autoplay=1&playsinline=1"
                allow="autoplay; fullscreen; picture-in-picture"
                allowfullscreen
              ></iframe>
            </div>
          </body>
        </html>
      `;
    }
    return '';
  };

  if (webViewError) {
    return (
      <View style={styles.errorContainer}>
        <IconSymbol
          ios_icon_name="exclamationmark.triangle.fill"
          android_material_icon_name="error"
          size={64}
          color="#FF0000"
        />
        <Text style={styles.errorTitle}>Video kan ikke afspilles</Text>
        <Text style={styles.errorText}>
          Denne video kan ikke afspilles i appen på grund af platformens begrænsninger.
        </Text>
        <TouchableOpacity
          style={styles.openExternalButton}
          onPress={openInExternalApp}
        >
          <IconSymbol
            ios_icon_name="play.rectangle.fill"
            android_material_icon_name="play_arrow"
            size={24}
            color="#fff"
          />
          <Text style={styles.openExternalButtonText}>
            Åbn i {videoInfo.platform === 'youtube' ? 'YouTube' : 'Vimeo'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.playerContainer}>
      <WebView
        source={{ html: generateEmbedHTML() }}
        style={styles.webView}
        allowsFullscreenVideo={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        mixedContentMode="always"
        originWhitelist={['*']}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView error:', nativeEvent);
          setWebViewError(true);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView HTTP error:', nativeEvent);
          if (nativeEvent.statusCode === 403 || nativeEvent.statusCode === 404) {
            setWebViewError(true);
          }
        }}
      />
    </View>
  );
}

/**
 * Video Thumbnail Component
 * Shows thumbnail with play button overlay
 */
interface VideoThumbnailProps {
  videoUrl: string;
  onPress: () => void;
  style?: any;
}

export function VideoThumbnail({ videoUrl, onPress, style }: VideoThumbnailProps) {
  const videoInfo = parseVideoUrl(videoUrl);

  if (videoInfo.platform === 'unsupported') {
    return null;
  }

  return (
    <TouchableOpacity 
      style={[styles.thumbnailContainer, style]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {videoInfo.thumbnailUrl ? (
        <Image
          source={{ uri: videoInfo.thumbnailUrl }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.thumbnail, styles.placeholderThumbnail]}>
          <IconSymbol
            ios_icon_name="play.rectangle.fill"
            android_material_icon_name="play_arrow"
            size={48}
            color="#fff"
          />
        </View>
      )}
      <View style={styles.playButtonOverlay}>
        <View style={[
          styles.playButton,
          videoInfo.platform === 'youtube' ? styles.youtubeButton : styles.vimeoButton
        ]}>
          <IconSymbol
            ios_icon_name="play.fill"
            android_material_icon_name="play_arrow"
            size={32}
            color="#fff"
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

/**
 * Video Modal Component
 * Full-screen modal for video playback
 */
interface VideoModalProps {
  visible: boolean;
  videoUrl: string;
  onClose: () => void;
  title?: string;
}

export function VideoModal({ visible, videoUrl, onClose, title }: VideoModalProps) {
  const videoInfo = parseVideoUrl(videoUrl);

  const openInExternalApp = () => {
    let externalUrl = videoUrl;
    
    if (videoInfo.platform === 'youtube' && videoInfo.videoId) {
      externalUrl = `https://www.youtube.com/watch?v=${videoInfo.videoId}`;
    } else if (videoInfo.platform === 'vimeo' && videoInfo.videoId) {
      externalUrl = `https://vimeo.com/${videoInfo.videoId}`;
    }

    Linking.openURL(externalUrl).catch(err => {
      console.error('Error opening video in external app:', err);
      Alert.alert('Fejl', 'Kunne ikke åbne video');
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity 
            onPress={onClose}
            style={styles.closeButton}
          >
            <IconSymbol
              ios_icon_name="xmark.circle.fill"
              android_material_icon_name="close"
              size={32}
              color="#fff"
            />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{title || 'Video'}</Text>
          <TouchableOpacity 
            onPress={openInExternalApp}
            style={styles.externalButton}
          >
            <IconSymbol
              ios_icon_name="arrow.up.right.square"
              android_material_icon_name="open_in_new"
              size={28}
              color="#fff"
            />
          </TouchableOpacity>
        </View>

        <VideoPlayer videoUrl={videoUrl} onClose={onClose} />
      </View>
    </Modal>
  );
}

/**
 * Video Action Buttons Component
 * Shows buttons to play in app or open externally
 */
interface VideoActionButtonsProps {
  videoUrl: string;
  onPlayInApp: () => void;
}

export function VideoActionButtons({ videoUrl, onPlayInApp }: VideoActionButtonsProps) {
  const videoInfo = parseVideoUrl(videoUrl);

  if (videoInfo.platform === 'unsupported') {
    return null;
  }

  const openInExternalApp = () => {
    let externalUrl = videoUrl;
    
    if (videoInfo.platform === 'youtube' && videoInfo.videoId) {
      externalUrl = `https://www.youtube.com/watch?v=${videoInfo.videoId}`;
    } else if (videoInfo.platform === 'vimeo' && videoInfo.videoId) {
      externalUrl = `https://vimeo.com/${videoInfo.videoId}`;
    }

    Linking.openURL(externalUrl).catch(err => {
      console.error('Error opening video in external app:', err);
      Alert.alert('Fejl', 'Kunne ikke åbne video');
    });
  };

  return (
    <View style={styles.actionButtons}>
      <TouchableOpacity 
        style={[styles.actionButton, styles.playInAppButton]}
        onPress={onPlayInApp}
      >
        <IconSymbol
          ios_icon_name="play.circle.fill"
          android_material_icon_name="play_circle"
          size={20}
          color="#fff"
        />
        <Text style={styles.actionButtonText}>Afspil i app</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[
          styles.actionButton,
          videoInfo.platform === 'youtube' ? styles.youtubeButton : styles.vimeoButton
        ]}
        onPress={openInExternalApp}
      >
        <IconSymbol
          ios_icon_name="arrow.up.right.square.fill"
          android_material_icon_name="open_in_new"
          size={20}
          color="#fff"
        />
        <Text style={styles.actionButtonText}>
          Åbn i {videoInfo.platform === 'youtube' ? 'YouTube' : 'Vimeo'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  playerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  webView: {
    flex: 1,
    backgroundColor: '#000',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#000',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  openExternalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
  },
  openExternalButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeErrorButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
  },
  closeErrorButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  thumbnailContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: 180,
    backgroundColor: '#000',
  },
  placeholderThumbnail: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  playButtonOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  youtubeButton: {
    backgroundColor: 'rgba(255,0,0,0.9)',
  },
  vimeoButton: {
    backgroundColor: 'rgba(26,183,234,0.9)',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  playInAppButton: {
    backgroundColor: colors.primary,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  closeButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  externalButton: {
    padding: 4,
  },
});
