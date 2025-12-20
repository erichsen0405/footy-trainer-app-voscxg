
import React, { useMemo, useState } from "react";
import { View, Text, Platform, Pressable, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import * as Linking from "expo-linking";

export default function VideoPlayer({ videoUrl }: { videoUrl: string }) {
  const [failed, setFailed] = useState(false);

  const video = useMemo(() => parseVideo(videoUrl), [videoUrl]);

  if (!video) return <Centered text="Ugyldigt video-link" />;

  if (failed && video.platform === "youtube" && Platform.OS === "ios") {
    return (
      <Centered>
        <Text style={{ marginBottom: 12, textAlign: "center" }}>
          Videoen kan ikke afspilles i appen
        </Text>
        <Pressable
          onPress={() => Linking.openURL(video.watchUrl)}
          style={{ backgroundColor: "#000", padding: 10, borderRadius: 6 }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Åbn i Safari</Text>
        </Pressable>
      </Centered>
    );
  }

  return (
    <View style={{ height: 220, backgroundColor: "#000" }}>
      <WebView
        source={{ uri: video.embedUrl }}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        originWhitelist={["*"]}
        userAgent={
          Platform.OS === "ios"
            ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1"
            : undefined
        }
        onError={() => setFailed(true)}
        onHttpError={(e) => e.nativeEvent.statusCode >= 400 && setFailed(true)}
        startInLoadingState
        renderLoading={() => <Centered><ActivityIndicator /></Centered>}
      />
    </View>
  );
}

function parseVideo(url: string) {
  if (!url) return null;

  if (url.includes("youtube")) {
    const id =
      url.split("v=")[1]?.split("&")[0] ||
      url.split("youtu.be/")[1]?.split("?")[0];
    if (!id) return null;

    return {
      platform: "youtube",
      embedUrl:
        `https://www.youtube.com/embed/${id}` +
        "?playsinline=1&controls=1&rel=0&modestbranding=1&enablejsapi=1&origin=https://www.youtube.com",
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
    };
  }

  if (url.includes("vimeo.com")) {
    const id = url.split("vimeo.com/")[1]?.split("?")[0];
    if (!id) return null;

    return {
      platform: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${id}`,
      watchUrl: `https://vimeo.com/${id}`,
    };
  }

  return null;
}

function Centered({ children, text }: any) {
  return (
    <View style={{ height: 220, justifyContent: "center", alignItems: "center", padding: 16 }}>
      {text ? <Text>{text}</Text> : children}
    </View>
  );
}
