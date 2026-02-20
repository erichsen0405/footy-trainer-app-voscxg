import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import TasksScreen from '../app/(tabs)/tasks';

const mockUseFootball = jest.fn();
const mockUseAdmin = jest.fn();

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => mockUseFootball(),
}));

jest.mock('@/contexts/AdminContext', () => ({
  useAdmin: () => mockUseAdmin(),
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

jest.mock('@/components/SmartVideoPlayer', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => <View />,
  };
});

jest.mock('@/components/ContextConfirmationDialog', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => <View />,
  };
});

jest.mock('@/components/AdminContextWrapper', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    AdminContextWrapper: ({ children }: any) => <View>{children}</View>,
  };
});

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1' } } },
        error: null,
      }),
    },
  },
}));

describe('Tasks delete confirmation modal', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAdmin.mockReturnValue({
      adminMode: 'self',
      adminTargetType: null,
      adminTargetId: null,
      selectedContext: null,
      contextName: null,
    });

    mockUseFootball.mockReturnValue({
      tasks: [
        {
          id: 'template-1',
          title: 'Sprint test',
          description: 'test',
          completed: false,
          isTemplate: true,
          categoryIds: ['cat-1'],
          subtasks: [],
          archivedAt: null,
        },
      ],
      categories: [
        {
          id: 'cat-1',
          name: 'Træning',
          color: '#00AAFF',
          emoji: '⚽️',
        },
      ],
      duplicateTask: jest.fn(),
      deleteTask: jest.fn().mockResolvedValue(undefined),
      refreshAll: jest.fn().mockResolvedValue(undefined),
      refreshData: jest.fn().mockResolvedValue(undefined),
      updateTask: jest.fn().mockResolvedValue(undefined),
      isLoading: false,
    });
  });

  it('requires case-sensitive SLET before delete confirm can be pressed', () => {
    const { getByTestId, getByText } = render(<TasksScreen />);

    fireEvent.press(getByTestId('tasks.folder.toggle.personal'));
    fireEvent.press(getByTestId('tasks.template.deleteButton.template-1'));

    expect(
      getByText(
        'Hvis du sletter denne opgaveskabelon, slettes alle tidligere og fremtidige opgaver på relaterede aktiviteter. Hvis du vil beholde historik, vælg Arkiver i stedet.',
      ),
    ).toBeTruthy();

    const confirmButton = getByTestId('tasks.template.deleteModal.confirmButton');
    expect(confirmButton.props.accessibilityState?.disabled ?? confirmButton.props.disabled).toBe(true);

    fireEvent.changeText(getByTestId('tasks.template.deleteModal.input'), 'slet');
    expect(
      getByTestId('tasks.template.deleteModal.confirmButton').props.accessibilityState?.disabled ??
        getByTestId('tasks.template.deleteModal.confirmButton').props.disabled,
    ).toBe(true);

    fireEvent.changeText(getByTestId('tasks.template.deleteModal.input'), 'SLET');
    expect(
      getByTestId('tasks.template.deleteModal.confirmButton').props.accessibilityState?.disabled ??
        getByTestId('tasks.template.deleteModal.confirmButton').props.disabled,
    ).toBe(false);
  });
});
