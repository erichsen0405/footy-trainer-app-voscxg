import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

import TaskScoreNoteModal from '@/components/TaskScoreNoteModal';

jest.mock('expo-blur', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    BlurView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('expo-linear-gradient', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    LinearGradient: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
  };
});

describe('TaskScoreNoteModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not render content before first visible mount', () => {
    const { queryByTestId } = render(
      <TaskScoreNoteModal visible={false} onClose={jest.fn()} />
    );

    expect(queryByTestId('feedback.saveButton')).toBeNull();
  });

  it('renders score and note inputs when visible', () => {
    const { getByTestId } = render(
      <TaskScoreNoteModal visible onClose={jest.fn()} />
    );

    expect(getByTestId('feedback.scoreInput')).toBeTruthy();
    expect(getByTestId('feedback.noteInput')).toBeTruthy();
  });

  it('sends expected payload on save after input changes', () => {
    const onSave = jest.fn();
    const { getByTestId } = render(
      <TaskScoreNoteModal visible onClose={jest.fn()} onSave={onSave} />
    );

    fireEvent.press(getByTestId('feedback.scoreOption.8'));
    fireEvent.changeText(getByTestId('feedback.noteInput'), '  Solid session  ');
    fireEvent.press(getByTestId('feedback.saveButton'));

    expect(onSave).toHaveBeenCalledWith({
      score: 8,
      note: 'Solid session',
    });
  });

  it('shows missing-score alert and does not call save when score is required', () => {
    const onSave = jest.fn();
    const { getByTestId } = render(
      <TaskScoreNoteModal
        visible
        onClose={jest.fn()}
        onSave={onSave}
        enableScore
        initialScore={null}
      />
    );

    fireEvent.press(getByTestId('feedback.saveButton'));

    expect(Alert.alert).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('uses clear flow when initially completed and unchanged', () => {
    const onClear = jest.fn();
    const { getByTestId } = render(
      <TaskScoreNoteModal
        visible
        onClose={jest.fn()}
        onSave={jest.fn()}
        onClear={onClear}
        initialScore={7}
        initialNote=""
      />
    );

    fireEvent.press(getByTestId('feedback.saveButton'));

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
