import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import CreateActivityModal from '../components/CreateActivityModal';

const mockRefreshCategories = jest.fn();

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => ({
    refreshCategories: mockRefreshCategories,
  }),
}));

jest.mock('@/components/IconSymbol', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    IconSymbol: ({ ios_icon_name, android_material_icon_name }: any) => (
      <Text>{ios_icon_name ?? android_material_icon_name ?? 'icon'}</Text>
    ),
  };
});

jest.mock('@/components/CategoryManagementModal', () => () => null);

describe('CreateActivityModal intensity scope', () => {
  const categories = [
    {
      id: 'cat-1',
      name: 'Training',
      color: '#123456',
      emoji: '⚽️',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reverts toggle on cancel and does not show intensity score options', () => {
    const { getByTestId, queryByTestId } = render(
      <CreateActivityModal
        visible
        onClose={jest.fn()}
        onCreateActivity={jest.fn().mockResolvedValue(undefined)}
        categories={categories as any}
        onRefreshCategories={jest.fn()}
      />
    );

    expect(queryByTestId('activity.create.intensityOption.1')).toBeNull();

    fireEvent(getByTestId('activity.create.intensityToggle'), 'valueChange', true);
    expect(getByTestId('activity.create.intensityScopeModal')).toBeTruthy();

    fireEvent.press(getByTestId('activity.create.intensityScopeModal.cancel'));
    expect(queryByTestId('activity.create.intensityScopeModal')).toBeNull();
    expect(getByTestId('activity.create.intensityToggle').props.value).toBe(false);
    expect(queryByTestId('activity.create.intensityOption.1')).toBeNull();
  });

  it('submits category scope when user chooses "Ja, tilføj til alle"', async () => {
    const onCreateActivity = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByTestId, queryByTestId } = render(
      <CreateActivityModal
        visible
        onClose={jest.fn()}
        onCreateActivity={onCreateActivity}
        categories={categories as any}
        onRefreshCategories={jest.fn()}
      />
    );

    fireEvent.changeText(getByTestId('activity.create.titleInput'), 'Ny aktivitet');
    fireEvent(getByTestId('activity.create.intensityToggle'), 'valueChange', true);
    fireEvent.press(getByTestId('activity.create.intensityScopeModal.all'));

    expect(queryByTestId('activity.create.intensityOption.1')).toBeNull();

    fireEvent.press(getByTestId('activity.create.submitButton'));

    await waitFor(() =>
      expect(onCreateActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: 'cat-1',
          intensityEnabled: true,
          intensityApplyScope: 'category',
        })
      )
    );
  });
});
