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
      <TaskScoreNoteModal visible={false} title="Feedback" initialScore={null} onSave={jest.fn()} onClose={jest.fn()} />
    );

    expect(queryByTestId('feedback.saveButton')).toBeNull();
  });

  it('renders score and note inputs when visible', () => {
    const { getByTestId } = render(
      <TaskScoreNoteModal visible title="Feedback" initialScore={null} onSave={jest.fn()} onClose={jest.fn()} />
    );

    expect(getByTestId('feedback.scoreInput')).toBeTruthy();
    expect(getByTestId('feedback.noteInput')).toBeTruthy();
  });

  it('sends expected payload on save after input changes', () => {
    const onSave = jest.fn();
    const { getByTestId } = render(
      <TaskScoreNoteModal visible title="Feedback" initialScore={null} onClose={jest.fn()} onSave={onSave} />
    );

    fireEvent.press(getByTestId('feedback.scoreInput'));
    fireEvent.press(getByTestId('feedback.scoreOption.8'));
    fireEvent.press(getByTestId('feedback.scoreDoneButton'));
    fireEvent.changeText(getByTestId('feedback.noteInput'), '  Solid session  ');
    fireEvent.press(getByTestId('feedback.saveButton'));

    expect(onSave).toHaveBeenCalledWith({
      score: 8,
      note: 'Solid session',
    });
  });

  it('keeps wheel open after selecting and collapses when pressing Færdig', () => {
    const { getByTestId, queryByTestId } = render(
      <TaskScoreNoteModal visible title="Feedback" initialScore={null} onSave={jest.fn()} onClose={jest.fn()} />
    );

    fireEvent.press(getByTestId('feedback.scoreInput'));
    expect(getByTestId('feedback.scoreDropdown.list')).toBeTruthy();

    fireEvent.press(getByTestId('feedback.scoreOption.7'));
    expect(getByTestId('feedback.scoreDropdown.list')).toBeTruthy();

    fireEvent.press(getByTestId('feedback.scoreDoneButton'));

    expect(queryByTestId('feedback.scoreDropdown.list')).toBeNull();
    expect(getByTestId('feedback.selectedScore.7')).toBeTruthy();
  });

  it('shows missing-score alert and does not call save when score is required', () => {
    const onSave = jest.fn();
    const { getByTestId } = render(
      <TaskScoreNoteModal
        visible
        title="Feedback"
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
        title="Feedback"
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
