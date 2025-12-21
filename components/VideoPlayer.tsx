
import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

interface Props {
  url: string;
}

/**
 * KRITISKE REGLER (iOS):
 * - WebView må aldrig mount/unmount baseret på props
 * - Ingen conditional rendering
 * - Ingen inline HTML-regenerering per render
 */
const VideoPlayer: React.FC<Props> = ({ url }) => {
  const html = useMemo(() => {
    if (!url) {
      // Tom, stabil HTML – WebView lever videre uden reload
      return '<html><body style="margin:0;background:black;"></body></html>';
    }

    // YouTube / Vimeo embed
    return `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            html, body {
              margin: 0;
              padding: 0;
              background: black;
              height: 100%;
              width: 100%;
            }
            iframe {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              border: 0;
            }
          </style>
        </head>
        <body>
          <iframe
            src="${url}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          ></iframe>
        </body>
      </html>
    `;
  }, [url]);

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        allowsFullscreenVideo
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        mediaPlaybackRequiresUserAction={Platform.OS === 'ios'}
        automaticallyAdjustContentInsets={false}
      />
    </View>
  );
};

export default VideoPlayer;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
});
