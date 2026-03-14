import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import SmartVideoPlayer from '@/components/SmartVideoPlayer';

const mockWebView = jest.fn();
const mockOpenUrl = jest.fn();

jest.mock('expo-linking', () => ({
  openURL: (...args: any[]) => mockOpenUrl(...args),
}));

jest.mock('react-native-webview', () => ({
  WebView: (props: any) => {
    const React = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');
    mockWebView(props);
    return <View testID={props.testID ?? 'mock-webview'} />;
  },
}));

describe('SmartVideoPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders inline video playback for Supabase storage keys', () => {
    const { getByTestId } = render(<SmartVideoPlayer url="focus/run.mp4" />);

    expect(getByTestId('smart-video-player.webview')).toBeTruthy();
    expect(mockWebView).toHaveBeenCalled();

    const props = mockWebView.mock.calls.at(-1)?.[0];
    expect(props?.source?.html).toContain('<video controls playsinline');
    expect(props?.source?.html).toContain(
      'https://lhpczofddvwcyrgotzha.supabase.co/storage/v1/object/public/drill-videos/focus/run.mp4'
    );
  });

  it('shows a YouTube thumbnail and opens the original link when pressed', () => {
    const { getByTestId } = render(
      <SmartVideoPlayer url="https://www.youtube.com/watch?si=share-token&v=dQw4w9WgXcQ" />
    );

    expect(getByTestId('smart-video-player.thumbnail')).toBeTruthy();
    fireEvent.press(getByTestId('smart-video-player.thumbnail'));

    expect(mockOpenUrl).toHaveBeenCalledWith('https://www.youtube.com/watch?si=share-token&v=dQw4w9WgXcQ');
  });
});
