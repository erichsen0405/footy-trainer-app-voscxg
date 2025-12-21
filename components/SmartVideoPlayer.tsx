
import React, { useState } from 'react';
import { View, Image, Pressable, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Linking from 'expo-linking';

export default function SmartVideoPlayer({ url }: { url?: string }) {
  const [playVimeo, setPlayVimeo] = useState(false);
  
  if (!url) return null;

  if (isYouTube(url)) {
    const id = ytId(url);
    if (!id) return null;
    return (
      <Thumb
        img={`https://img.youtube.com/vi/${id}/hqdefault.jpg`}
        onPress={() => Linking.openURL(url)}
      />
    );
  }

  if (isVimeo(url)) {
    const id = vimeoId(url);
    if (!id) return null;

    // CRITICAL FIX: WebView is always mounted, visibility controlled via opacity and height
    return (
      <View style={styles.vimeoContainer}>
        {/* Thumbnail overlay - shown when not playing */}
        <View 
          style={[
            styles.thumbnailOverlay,
            { 
              opacity: playVimeo ? 0 : 1,
              pointerEvents: playVimeo ? 'none' : 'auto'
            }
          ]}
        >
          <Thumb
            img={`https://vumbnail.com/${id}.jpg`}
            onPress={() => setPlayVimeo(true)}
          />
        </View>

        {/* WebView - always mounted, visibility controlled via opacity */}
        <View 
          style={[
            styles.webViewContainer,
            { 
              opacity: playVimeo ? 1 : 0,
              height: playVimeo ? 220 : 0
            }
          ]}
        >
          <WebView
            source={{ uri: `https://player.vimeo.com/video/${id}` }}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            style={styles.webView}
          />
        </View>
      </View>
    );
  }

  return null;
}

/* helpers */
const isYouTube = (u: string) =>
  u.includes('youtu.be') || u.includes('youtube.com');
const isVimeo = (u: string) => u.includes('vimeo.com');
const ytId = (u: string) =>
  u.split('v=')[1]?.split('&')[0] ||
  u.split('youtu.be/')[1]?.split('?')[0];
const vimeoId = (u: string) =>
  u.split('vimeo.com/')[1]?.split('?')[0];

/* ui */
const Thumb = ({ img, onPress }: any) => (
  <Pressable onPress={onPress} style={styles.thumbContainer}>
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
