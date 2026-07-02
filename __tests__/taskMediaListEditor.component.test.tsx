import React from 'react';
import { Animated, PanResponder } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import { TaskMediaListEditor } from '@/components/TaskMediaListEditor';

jest.mock('@/components/IconSymbol', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    IconSymbol: ({ ios_icon_name }: { ios_icon_name?: string }) => <Text>{ios_icon_name ?? 'icon'}</Text>,
  };
});

describe('TaskMediaListEditor', () => {
  beforeEach(() => {
    jest.spyOn(Animated, 'spring').mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    } as unknown as Animated.CompositeAnimation);
    jest.spyOn(PanResponder, 'create').mockImplementation((config: any) => ({
      panHandlers: {
        onStartShouldSetResponderCapture: config.onStartShouldSetPanResponderCapture,
        onMoveShouldSetResponderCapture: config.onMoveShouldSetPanResponderCapture,
        onResponderGrant: config.onPanResponderGrant,
        onResponderMove: config.onPanResponderMove,
        onResponderRelease: config.onPanResponderRelease,
        onResponderTerminate: config.onPanResponderTerminate,
        onResponderTerminationRequest: config.onPanResponderTerminationRequest,
        onShouldBlockNativeResponder: config.onShouldBlockNativeResponder,
      },
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('locks parent scrolling while a media drag is active', () => {
    const onChange = jest.fn();
    const onDragStateChange = jest.fn();
    const { getByTestId } = render(
      <TaskMediaListEditor
        urls={['https://example.com/a.mp4', 'https://example.com/b.mp4', 'https://example.com/c.mp4']}
        names={['Warmup clip', 'Sprint clip', 'Shape image']}
        onChange={onChange}
        getLabel={(url) => url}
        onRemove={() => {}}
        disabled={false}
        backgroundColor="#fff"
        borderColor="#ddd"
        textColor="#111"
        secondaryTextColor="#666"
        accentColor="#2563eb"
        dangerColor="#dc2626"
        testIDPrefix="test.media"
        onDragStateChange={onDragStateChange}
      />
    );

    const handleProps = getByTestId('test.media.dragHandle.0').props;

    const event = {};

    expect(handleProps.onStartShouldSetResponderCapture(event, { dy: 0, numberActiveTouches: 1 })).toBe(true);

    act(() => {
      handleProps.onResponderGrant(event, { dy: 0, numberActiveTouches: 1 });
    });

    expect(onDragStateChange).toHaveBeenLastCalledWith(true);

    act(() => {
      handleProps.onResponderMove(event, { dy: 80, numberActiveTouches: 1 });
    });

    const rowStyleProp = getByTestId('test.media.row.1').props.style;
    const rowStyles = Array.isArray(rowStyleProp) ? rowStyleProp : [rowStyleProp];
    const transformStyle = rowStyles.find((style) => Array.isArray(style?.transform));
    expect(transformStyle?.transform?.[0]).toEqual({ translateY: -80 });

    act(() => {
      handleProps.onResponderRelease(event, { dy: 80, numberActiveTouches: 1 });
    });

    expect(onDragStateChange).toHaveBeenLastCalledWith(false);
    expect(onChange).toHaveBeenCalledWith(
      ['https://example.com/b.mp4', 'https://example.com/a.mp4', 'https://example.com/c.mp4'],
      ['Sprint clip', 'Warmup clip', 'Shape image'],
    );
  });

  it('lets the caller rename and preview a media item without changing the stable title', () => {
    const onRename = jest.fn();
    const onPreview = jest.fn();
    const { getByTestId, getByText } = render(
      <TaskMediaListEditor
        urls={['https://example.com/a.mp4']}
        names={['Warmup clip']}
        onChange={() => {}}
        getLabel={() => 'Uploaded video'}
        onRemove={() => {}}
        onPreview={onPreview}
        onRename={onRename}
        disabled={false}
        backgroundColor="#fff"
        borderColor="#ddd"
        textColor="#111"
        secondaryTextColor="#666"
        accentColor="#2563eb"
        dangerColor="#dc2626"
        testIDPrefix="test.media"
      />
    );

    expect(getByText('Uploaded video')).toBeTruthy();

    fireEvent.changeText(getByTestId('test.media.nameInput.0'), 'Finishing clip');
    fireEvent.press(getByTestId('test.media.preview.0'));

    expect(onRename).toHaveBeenCalledWith(0, 'Finishing clip');
    expect(onPreview).toHaveBeenCalledWith(0);
  });
});
