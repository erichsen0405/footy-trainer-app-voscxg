import React from 'react';
import { Text, View } from 'react-native';
import { render } from '@testing-library/react-native';

import TaskDetailsModal from '@/components/TaskDetailsModal';

const mockSmartVideoPlayer = jest.fn();

jest.mock('expo-blur', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    BlurView: ({ children }: any) => <View>{children}</View>,
  };
});

jest.mock('expo-linear-gradient', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    LinearGradient: ({ children }: any) => <View>{children}</View>,
  };
});

jest.mock('@/components/IconSymbol', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    IconSymbol: () => <Text>icon</Text>,
  };
});

jest.mock('@/components/SmartVideoPlayer', () => {
  const React = jest.requireActual('react');
  const { View, Text } = jest.requireActual('react-native');
  return (props: any) => {
    mockSmartVideoPlayer(props);
    return (
      <View testID="mock.smartVideoPlayer">
        <Text>{props.url}</Text>
      </View>
    );
  };
});

describe('TaskDetailsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows fallback text when the task has no details', () => {
    const { getByText } = render(
      <TaskDetailsModal
        visible
        title="Tom opgave"
        categoryColor="#3B82F6"
        isDark={false}
        onClose={() => {}}
        onComplete={() => {}}
      />
    );

    expect(getByText('Ingen detaljer på denne opgave endnu.')).toBeTruthy();
  });

  it('renders video from a URL embedded in the description', () => {
    const { getByTestId, queryByText } = render(
      <TaskDetailsModal
        visible
        title="Videoopgave"
        categoryColor="#3B82F6"
        isDark={false}
        description="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        onClose={() => {}}
        onComplete={() => {}}
      />
    );

    expect(getByTestId('mock.smartVideoPlayer')).toBeTruthy();
    expect(mockSmartVideoPlayer.mock.calls.at(-1)?.[0]?.url).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );
    expect(queryByText('Beskrivelse')).toBeNull();
  });

  it('keeps ordinary links in the description instead of treating them as video', () => {
    const { getByText, queryByTestId, queryByText } = render(
      <TaskDetailsModal
        visible
        title="Guide"
        categoryColor="#3B82F6"
        isDark={false}
        description="Laes mere her https://example.com/guide"
        onClose={() => {}}
        onComplete={() => {}}
      />
    );

    expect(queryByTestId('mock.smartVideoPlayer')).toBeNull();
    expect(getByText('Beskrivelse')).toBeTruthy();
    expect(getByText('Laes mere her https://example.com/guide')).toBeTruthy();
    expect(queryByText('Ingen detaljer på denne opgave endnu.')).toBeNull();
  });
});
