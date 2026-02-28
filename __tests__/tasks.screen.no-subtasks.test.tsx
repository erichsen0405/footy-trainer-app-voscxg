import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import TasksScreen from '../app/(tabs)/tasks';

const mockUseFootball = jest.fn();
const mockUseAdmin = jest.fn();
const mockCreateTask = jest.fn();

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => mockUseFootball(),
}));

jest.mock('@/contexts/AdminContext', () => ({
  useAdmin: () => mockUseAdmin(),
}));

jest.mock('@/services/taskService', () => ({
  taskService: {
    createTask: (...args: any[]) => mockCreateTask(...args),
    setTaskTemplateArchived: jest.fn(),
  },
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

describe('Tasks template editor without subtasks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateTask.mockResolvedValue({
      id: 'template-created',
      title: 'Ny skabelon',
      description: '',
      completed: false,
      isTemplate: true,
      categoryIds: [],
      subtasks: [],
    });

    mockUseAdmin.mockReturnValue({
      adminMode: 'self',
      adminTargetType: null,
      adminTargetId: null,
      selectedContext: null,
      contextName: null,
    });

    mockUseFootball.mockReturnValue({
      tasks: [],
      categories: [],
      duplicateTask: jest.fn(),
      deleteTask: jest.fn().mockResolvedValue(undefined),
      refreshAll: jest.fn().mockResolvedValue(undefined),
      refreshData: jest.fn().mockResolvedValue(undefined),
      updateTask: jest.fn().mockResolvedValue(undefined),
      isLoading: false,
    });
  });

  it('hides subtask UI and saves template without subtasks payload', async () => {
    const { getByTestId, queryByText, queryByTestId } = render(<TasksScreen />);

    fireEvent.press(getByTestId('tasks.newTemplateButton'));

    expect(queryByText('Delopgaver')).toBeNull();
    expect(queryByTestId('tasks.template.subtaskInput.0')).toBeNull();

    fireEvent.changeText(getByTestId('tasks.template.titleInput'), 'Template uden delopgaver');
    fireEvent.press(getByTestId('tasks.template.saveButton'));

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledTimes(1);
    });

    const createArg = mockCreateTask.mock.calls[0][0];
    expect(createArg).toBeDefined();
    expect(createArg.subtasks).toBeUndefined();
  });
});

