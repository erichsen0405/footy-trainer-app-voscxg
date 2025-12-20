
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
 * 
 * CRITICAL FIXES FOR iOS:
 * 1. Support for ANY video URL (not just YouTube/Vimeo)
 * 2. HTML <video> wrapper for better iOS compatibility
 * 3. Proper WebView configuration for video playback
 * 4. CRUCIAL: userAgent is critical - without it, WebView is treated as "embedded client" and rejected
 */
export function VideoPlayer({ videoUrl, onClose }: VideoPlayerProps) {
  const [webViewError, setWebViewError] = useState(false);
  const videoInfo = parseVideoUrl(videoUrl);

  console.log('🎬 VideoPlayer rendering with URL:', videoUrl);
  console.log('🎬 Video info:', videoInfo);

  // Check if it's a known platform (YouTube/Vimeo)
  const isKnownPlatform = videoInfo.platform !== 'unsupported';

  // For known platforms, use embed URL
  if (isKnownPlatform && !videoInfo.embedUrl) {
    console.error('❌ No embed URL available for:', videoUrl);
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

    console.log('🔗 Opening external URL:', externalUrl);
    Linking.openURL(externalUrl).catch(err => {
      console.error('❌ Error opening video in external app:', err);
      Alert.alert('Fejl', 'Kunne ikke åbne video');
    });
  };

  // Show error if WebView failed to load
  if (webViewError) {
    console.error('❌ WebView error occurred');
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
          Denne video kan ikke afspilles i appen.
          {isKnownPlatform && (
            `\nPrøv at åbne den i ${videoInfo.platform === 'youtube' ? 'YouTube' : 'Vimeo'} app'en.`
          )}
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
            Åbn {isKnownPlatform ? `i ${videoInfo.platform === 'youtube' ? 'YouTube' : 'Vimeo'}` : 'video'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // WebView is only available on iOS and Android
  if (!WebView || Platform.OS === 'web') {
    console.warn('⚠️ WebView not available on this platform');
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

  // CRITICAL FIX: Determine how to render the video
  // For known platforms (YouTube/Vimeo), use iframe embed
  // For other URLs, use HTML <video> tag
  const renderSource = () => {
    if (isKnownPlatform && videoInfo.embedUrl) {
      // YouTube/Vimeo: Use iframe embed
      console.log('📹 Using iframe embed for known platform:', videoInfo.platform);
      
      const getEmbedUrlWithParams = () => {
        if (videoInfo.platform === 'youtube') {
          const params = [
            'playsinline=1',
            'autoplay=0',
            'rel=0',
            'modestbranding=1',
            'controls=1',
            'enablejsapi=1',
            'fs=1',
            'iv_load_policy=3',
          ].join('&');
          return `${videoInfo.embedUrl}?${params}`;
        } else if (videoInfo.platform === 'vimeo') {
          const params = [
            'playsinline=1',
            'autoplay=0',
            'title=0',
            'byline=0',
            'portrait=0',
          ].join('&');
          return `${videoInfo.embedUrl}?${params}`;
        }
        return videoInfo.embedUrl;
      };

      const embedUrl = getEmbedUrlWithParams();
      console.log('🎬 Final embed URL:', embedUrl);

      return { uri: embedUrl };
    } else {
      // CRITICAL FIX: For raw video URLs (Supabase, CDN, etc.), use HTML <video> tag
      // This is MUCH more reliable on iOS than trying to load raw video URLs directly
      console.log('📹 Using HTML <video> tag for raw video URL');
      
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              body {
                background: #000;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                overflow: hidden;
              }
              video {
                width: 100%;
                height: 100%;
                object-fit: contain;
              }
            </style>
          </head>
          <body>
            <video
              src="${videoUrl}"
              controls
              playsinline
              webkit-playsinline
              preload="metadata"
            >
              Your browser does not support the video tag.
            </video>
          </body>
        </html>
      `;

      console.log('📹 Generated HTML for video player');
      return { html };
    }
  };

  const source = renderSource();
  const isHtmlSource = 'html' in source;

  return (
    <View style={styles.playerContainer}>
      <WebView
        source={source}
        style={styles.webView}
        // CRITICAL: javaScriptEnabled is required for video playback
        javaScriptEnabled={true}
        // CRITICAL: domStorageEnabled is required for video playback
        domStorageEnabled={true}
        // CRITICAL: allowsInlineMediaPlayback allows video to play inline (not fullscreen)
        allowsInlineMediaPlayback={true}
        // CRITICAL: mediaPlaybackRequiresUserAction=false allows autoplay
        mediaPlaybackRequiresUserAction={false}
        // CRITICAL: allowsFullscreenVideo enables fullscreen button
        allowsFullscreenVideo={true}
        // CRITICAL: originWhitelist=['*'] allows loading from any domain
        originWhitelist={['*']}
        // CRITICAL: userAgent is THE MOST IMPORTANT PROPERTY
        // Without it, WebView is treated as "embedded client" and gets rejected
        // This specific userAgent makes the WebView appear as a real Safari browser
        userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1"
        // Additional props for better compatibility
        startInLoadingState={true}
        scalesPageToFit={true}
        mixedContentMode="always"
        // Enable shared cookies for YouTube authentication (only for iframe embeds)
        sharedCookiesEnabled={!isHtmlSource}
        // Error handling
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('❌ WebView error:', nativeEvent);
          setWebViewError(true);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('❌ WebView HTTP error:', nativeEvent.statusCode, nativeEvent.url);
          if (nativeEvent.statusCode === 403 || nativeEvent.statusCode === 404 || nativeEvent.statusCode === 502) {
            setWebViewError(true);
          }
        }}
        onLoadStart={() => {
          console.log('🔄 WebView load started');
        }}
        onLoadEnd={() => {
          console.log('✅ WebView load completed');
        }}
        onLoadProgress={({ nativeEvent }) => {
          console.log('📊 WebView load progress:', nativeEvent.progress);
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
          videoInfo.platform === 'youtube' ? styles.youtubeButton : 
          videoInfo.platform === 'vimeo' ? styles.vimeoButton : 
          styles.genericButton
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
          videoInfo.platform === 'youtube' ? styles.youtubeButton : 
          videoInfo.platform === 'vimeo' ? styles.vimeoButton : 
          styles.genericButton
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
          Åbn {videoInfo.platform === 'youtube' ? 'i YouTube' : 
               videoInfo.platform === 'vimeo' ? 'i Vimeo' : 
               'eksternt'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  playerContainer: {
    flex: 1,
    backgroundColor: '#000',
    minHeight: 200,
    minWidth: 200,
  },
  webView: {
    flex: 1,
    backgroundColor: '#000',
    width: '100%',
    height: '100%',
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
  genericButton: {
    backgroundColor: 'rgba(76,175,80,0.9)',
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
