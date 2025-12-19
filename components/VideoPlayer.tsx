
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
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { parseVideoUrl, isValidVideoUrl, getVideoThumbnail } from '@/utils/videoUrlParser';

// Only import WebView on native platforms
let WebView: any = null;
if (Platform.OS === 'ios' || Platform.OS === 'android') {
  WebView = require('react-native-webview').WebView;
}

interface VideoPlayerProps {
  videoUrl: string;
  onClose?: () => void;
}

/**
 * Video Player Component
 * Supports YouTube and Vimeo with inline playback on iOS and Android
 */
export function VideoPlayer({ videoUrl, onClose }: VideoPlayerProps) {
  const [webViewError, setWebViewError] = useState(false);
  const videoInfo = parseVideoUrl(videoUrl);

  // Check if URL is valid
  if (!isValidVideoUrl(videoUrl)) {
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
          Kun YouTube og Vimeo links understøttes.{'\n'}
          Sørg for at bruge et gyldigt video link.
        </Text>
        {onClose && (
          <TouchableOpacity style={styles.closeErrorButton} onPress={onClose}>
            <Text style={styles.closeErrorButtonText}>Luk</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Check if embed URL is available
  if (!videoInfo.embedUrl) {
    return (
      <View style={styles.errorContainer}>
        <IconSymbol
          ios_icon_name="exclamationmark.triangle.fill"
          android_material_icon_name="error"
          size={64}
          color="#FF0000"
        />
        <Text style={styles.errorTitle}>Kan ikke konvertere URL</Text>
        <Text style={styles.errorText}>
          Video URL&apos;en kunne ikke konverteres til et gyldigt embed format.
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

  // Generate proper embed URL with parameters
  // CRITICAL FIX: Added enablejsapi=1 and origin parameter for iOS WebView compatibility
  const getEmbedUrlWithParams = () => {
    if (videoInfo.platform === 'youtube') {
      // YouTube requires these specific parameters to work in iOS WebView:
      // - playsinline=1: Allows inline playback
      // - autoplay=0: Don't autoplay
      // - rel=0: Don't show related videos
      // - modestbranding=1: Minimal YouTube branding
      // - controls=1: Show player controls
      // - enablejsapi=1: Enable JavaScript API (REQUIRED for iOS)
      // - origin=https://www.youtube.com: Identify origin (REQUIRED for iOS to avoid 502)
      return `${videoInfo.embedUrl}?playsinline=1&autoplay=0&rel=0&modestbranding=1&controls=1&enablejsapi=1&origin=https://www.youtube.com`;
    } else if (videoInfo.platform === 'vimeo') {
      return `${videoInfo.embedUrl}?playsinline=1&autoplay=0`;
    }
    return videoInfo.embedUrl;
  };

  // Show error if WebView failed to load
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
          Denne video kan ikke afspilles i appen.{'\n'}
          Prøv at åbne den i {videoInfo.platform === 'youtube' ? 'YouTube' : 'Vimeo'} app&apos;en.
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

  // WebView is only available on iOS and Android
  if (!WebView || Platform.OS === 'web') {
    return (
      <View style={styles.errorContainer}>
        <IconSymbol
          ios_icon_name="play.rectangle.fill"
          android_material_icon_name="play_arrow"
          size={64}
          color={colors.primary}
        />
        <Text style={styles.errorTitle}>Video afspilning</Text>
        <Text style={styles.errorText}>
          Video afspilning i appen er kun tilgængelig på iOS og Android.
        </Text>
        <TouchableOpacity
          style={styles.openExternalButton}
          onPress={openInExternalApp}
        >
          <IconSymbol
            ios_icon_name="arrow.up.right.square.fill"
            android_material_icon_name="open_in_new"
            size={24}
            color="#fff"
          />
          <Text style={styles.openExternalButtonText}>
            Åbn video
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const embedUrlWithParams = getEmbedUrlWithParams();

  return (
    <View style={styles.playerContainer}>
      <WebView
        source={{ uri: embedUrlWithParams }}
        style={styles.webView}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        originWhitelist={['*']}
        userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1"
        startInLoadingState={true}
        scalesPageToFit={true}
        mixedContentMode="always"
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView error (153):', nativeEvent);
          setWebViewError(true);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView HTTP error:', nativeEvent);
          if (nativeEvent.statusCode === 403 || nativeEvent.statusCode === 404 || nativeEvent.statusCode === 502) {
            setWebViewError(true);
          }
        }}
        onLoadEnd={() => {
          console.log('Video loaded successfully:', embedUrlWithParams);
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

  if (!isValidVideoUrl(videoUrl)) {
    return null;
  }

  const thumbnailUrl = getVideoThumbnail(videoUrl);

  return (
    <TouchableOpacity 
      style={[styles.thumbnailContainer, style]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {thumbnailUrl ? (
        <Image
          source={{ uri: thumbnailUrl }}
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

  if (!isValidVideoUrl(videoUrl)) {
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
