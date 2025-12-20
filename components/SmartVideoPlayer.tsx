
import React, { useState } from 'react';
import { View, Image, Pressable, Text } from 'react-native';
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

    if (!playVimeo) {
      return (
        <Thumb
          img={`https://vumbnail.com/${id}.jpg`}
          onPress={() => setPlayVimeo(true)}
        />
      );
    }

    return (
      <View style={{ height: 220, backgroundColor: '#000' }}>
        <WebView
          source={{ uri: `https://player.vimeo.com/video/${id}` }}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          allowsFullscreenVideo
        />
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
  <Pressable onPress={onPress}>
    <Image
      source={{ uri: img }}
      style={{ height: 220, width: '100%' }}
      resizeMode="cover"
    />
    <View style={{
      position: 'absolute', inset: 0,
      alignItems: 'center', justifyContent: 'center'
    }}>
      <View style={{
        width: 60, height: 60, borderRadius: 30,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center', justifyContent: 'center'
      }}>
        <Text style={{ color: '#fff', fontSize: 24 }}>▶</Text>
      </View>
    </View>
  </Pressable>
);
