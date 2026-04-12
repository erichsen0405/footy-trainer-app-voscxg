import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import TasksScreen from '../app/(tabs)/tasks';

const mockUseFootball = jest.fn();
const mockUseAdmin = jest.fn();
const mockCreateTask = jest.fn();
const mockUseAuthSession = jest.fn();

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => mockUseFootball(),
}));

jest.mock('@/contexts/AdminContext', () => ({
  useAdmin: () => mockUseAdmin(),
}));

jest.mock('@/contexts/AuthSessionContext', () => ({
  useAuthSession: () => mockUseAuthSession(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: () => {},
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
    mockUseAuthSession.mockReturnValue({
      authReady: true,
      isAuthenticated: true,
      user: { id: 'user-1' },
      session: { user: { id: 'user-1' } },
      refreshSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
    });
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

  it('shows empty state when there are 0 task templates', () => {
    const { getByText } = render(<TasksScreen />);

    expect(getByText('Ingen aktive opgaveskabeloner')).toBeTruthy();
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

  it('shows category dropdown and lets user select categories', () => {
    mockUseFootball.mockReturnValue({
      tasks: [
        {
          id: 'template-1',
          title: 'Pasningsøvelse',
          description: 'test',
          completed: false,
          isTemplate: true,
          categoryIds: ['cat-1'],
          subtasks: [],
          archivedAt: null,
        },
      ],
      categories: [
        { id: 'cat-1', name: 'Teknik', color: '#00AAFF', emoji: '⚽️' },
        { id: 'cat-2', name: 'Styrke', color: '#EF4444', emoji: '💪' },
      ],
      duplicateTask: jest.fn(),
      deleteTask: jest.fn().mockResolvedValue(undefined),
      refreshAll: jest.fn().mockResolvedValue(undefined),
      refreshData: jest.fn().mockResolvedValue(undefined),
      updateTask: jest.fn().mockResolvedValue(undefined),
      isLoading: false,
    });

    const { getByTestId, getByText, queryByTestId, queryByText } = render(<TasksScreen />);

    fireEvent.press(getByTestId('tasks.folder.toggle.personal'));
    fireEvent.press(getByTestId('tasks.template.card.template-1'));

    expect(getByText('Indsæt link til video')).toBeTruthy();
    expect(getByText('Teknik')).toBeTruthy();
    expect(queryByText('Teknik, Styrke')).toBeNull();

    fireEvent.press(getByTestId('tasks.template.categoryDropdownToggle'));
    fireEvent.press(getByTestId('tasks.template.categoryOption.1'));

    expect(getByText('Teknik, Styrke')).toBeTruthy();
  });

  it('reopens a template with snake_case video_url populated in the editor', () => {
    mockUseFootball.mockReturnValue({
      tasks: [
        {
          id: 'template-ig-1',
          title: 'Instagram template',
          description: 'test',
          completed: false,
          isTemplate: true,
          categoryIds: [],
          subtasks: [],
          video_url: 'https://www.instagram.com/reel/C7N2KQ2uV9x/?igsh=MWQ=',
          archivedAt: null,
        },
      ],
      categories: [],
      duplicateTask: jest.fn(),
      deleteTask: jest.fn().mockResolvedValue(undefined),
      refreshAll: jest.fn().mockResolvedValue(undefined),
      refreshData: jest.fn().mockResolvedValue(undefined),
      updateTask: jest.fn().mockResolvedValue(undefined),
      isLoading: false,
    });

    const { getByDisplayValue, getByTestId } = render(<TasksScreen />);

    fireEvent.press(getByTestId('tasks.folder.toggle.personal'));
    fireEvent.press(getByTestId('tasks.template.card.template-ig-1'));

    expect(getByDisplayValue('https://www.instagram.com/reel/C7N2KQ2uV9x/?igsh=MWQ=')).toBeTruthy();
  });
});
