import React from 'react';
import { render } from '@testing-library/react-native';

import SwipeVideoPlayer from '@/components/SwipeVideoPlayer';

jest.mock('@/components/SmartVideoPlayer', () => {
  const React = jest.requireActual('react');
  const { Text, View } = jest.requireActual('react-native');
  return function MockSmartVideoPlayer({ url }: { url?: string }) {
    return (
      <View testID="mock.smartVideoPlayer">
        <Text>{url}</Text>
      </View>
    );
  };
});

describe('SwipeVideoPlayer', () => {
  it('shows swipe hint and renders multiple videos', () => {
    const { getByText, getAllByTestId } = render(
      <SwipeVideoPlayer urls={['focus/one.mp4', 'focus/two.mp4']} testID="video.carousel" />
    );

    expect(getAllByTestId('mock.smartVideoPlayer')).toHaveLength(2);
    expect(getByText('Swipe for next file')).toBeTruthy();
    expect(getByText('1/2')).toBeTruthy();
  });

  it('hides swipe hint for a single video', () => {
    const { queryByText, getAllByTestId } = render(<SwipeVideoPlayer urls={['focus/one.mp4']} />);

    expect(getAllByTestId('mock.smartVideoPlayer')).toHaveLength(1);
    expect(queryByText('Swipe for next file')).toBeNull();
  });

  it('can render a compact counter-only hint for card previews', () => {
    const { getByText, queryByText } = render(
      <SwipeVideoPlayer
        urls={['focus/one.mp4', 'focus/two.mp4']}
        hintVariant="counter"
        surfaceColor="#F8FAFC"
      />
    );

    expect(queryByText('Swipe for next file')).toBeNull();
    expect(getByText('1/2')).toBeTruthy();
  });
});
