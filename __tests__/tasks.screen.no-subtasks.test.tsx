import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import TasksScreen from '../app/(tabs)/tasks';

const mockUseFootball = jest.fn();
const mockUseAdmin = jest.fn();
const mockCreateTask = jest.fn();
const mockUseAuthSession = jest.fn();
const mockUseUserRole = jest.fn();
const mockUseTeamPlayer = jest.fn();

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => mockUseFootball(),
}));

jest.mock('@/contexts/AdminContext', () => ({
  useAdmin: () => mockUseAdmin(),
}));

jest.mock('@/contexts/AuthSessionContext', () => ({
  useAuthSession: () => mockUseAuthSession(),
}));

jest.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => mockUseUserRole(),
}));

jest.mock('@/contexts/TeamPlayerContext', () => ({
  useTeamPlayer: () => mockUseTeamPlayer(),
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

const baseTask = (overrides: Record<string, any>) => ({
  id: 'template-1',
  title: 'Pasningsøvelse',
  description: 'test',
  completed: false,
  isTemplate: true,
  categoryIds: [],
  subtasks: [],
  archivedAt: null,
  userId: 'user-1',
  ...overrides,
});

const baseFootball = (overrides: Record<string, any> = {}) => ({
  tasks: [],
  categories: [],
  duplicateTask: jest.fn(),
  deleteTask: jest.fn().mockResolvedValue(undefined),
  refreshAll: jest.fn().mockResolvedValue(undefined),
  refreshData: jest.fn().mockResolvedValue(undefined),
  updateTask: jest.fn().mockResolvedValue(undefined),
  isLoading: false,
  ...overrides,
});

describe('Tasks redesigned template screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthSession.mockReturnValue({
      authReady: true,
      isAuthenticated: true,
      user: { id: 'user-1' },
      session: { user: { id: 'user-1' } },
      refreshSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
    });
    mockUseUserRole.mockReturnValue({ userRole: 'trainer', loading: false, isAdmin: true });
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
      startAdminPlayer: jest.fn(),
      startAdminTeam: jest.fn(),
      exitAdmin: jest.fn(),
    });

    mockUseTeamPlayer.mockReturnValue({
      players: [],
      teams: [],
      selectedContext: { type: null, id: null, name: null },
      loading: false,
      ensureRosterLoaded: jest.fn().mockResolvedValue({ players: [], teams: [] }),
      setSelectedContext: jest.fn().mockResolvedValue(undefined),
    });

    mockUseFootball.mockReturnValue(baseFootball());
  });

  it('shows the Tasks header and New task CTA', () => {
    const { getByTestId, getByText } = render(<TasksScreen />);

    expect(getByTestId('tasks.header.title')).toHaveTextContent('Tasks');
    expect(getByTestId('tasks.header.newTaskButton')).toBeTruthy();
    expect(getByText('New task')).toBeTruthy();
  });

  it('groups trainer self-mode templates into personal and inspiration folders', () => {
    mockUseFootball.mockReturnValue(baseFootball({
      tasks: [
        baseTask({ id: 'personal-1', title: 'Egen opgave' }),
        baseTask({ id: 'fc-1', title: 'FC opgave', source_folder: 'FootballCoach Inspiration' }),
      ],
    }));

    const { getByTestId, getByText } = render(<TasksScreen />);

    expect(getByTestId('tasks.folder.personal')).toBeTruthy();
    expect(getByTestId('tasks.folder.inspiration')).toBeTruthy();
    expect(getByText('Personal tasks')).toBeTruthy();
    expect(getByText('FootballCoach Inspiration')).toBeTruthy();
  });

  it('shows player self-mode trainer templates in the flat plan list', () => {
    mockUseUserRole.mockReturnValue({ userRole: 'player', loading: false, isAdmin: false });
    mockUseFootball.mockReturnValue(baseFootball({
      tasks: [
        baseTask({
          id: 'trainer-task-1',
          title: 'Fra coach',
          userId: 'trainer-1',
          trainerName: 'Coach Mads',
          source_folder: 'From coach: Coach Mads',
        }),
      ],
    }));

    const { getByTestId, getByText } = render(<TasksScreen />);

    expect(getByTestId('tasks.sourceFilter.coach')).toBeTruthy();
    expect(getByTestId('tasks.taskCard.trainer-task-1')).toBeTruthy();
    expect(getByTestId('tasks.task.source.trainer-task-1').props.accessibilityLabel).toBe('Source: From Coach Mads');
    expect(getByText('person.2.fill')).toBeTruthy();
  });

  it('shows selected admin context templates under personal tasks', () => {
    mockUseUserRole.mockReturnValue({ userRole: 'trainer', loading: false, isAdmin: true });
    mockUseAdmin.mockReturnValue({
      adminMode: 'player',
      adminTargetType: 'player',
      adminTargetId: 'player-1',
      selectedContext: { type: 'player', name: 'Spiller A' },
      contextName: 'Spiller A',
      startAdminPlayer: jest.fn(),
      startAdminTeam: jest.fn(),
      exitAdmin: jest.fn(),
    });
    mockUseTeamPlayer.mockReturnValue({
      players: [{ id: 'player-1', email: '', full_name: 'Spiller A' }],
      teams: [],
      selectedContext: { type: 'player', id: 'player-1', name: 'Spiller A' },
      loading: false,
      ensureRosterLoaded: jest.fn().mockResolvedValue({ players: [], teams: [] }),
      setSelectedContext: jest.fn().mockResolvedValue(undefined),
    });
    mockUseFootball.mockReturnValue(baseFootball({
      tasks: [baseTask({ id: 'admin-task-1', title: 'Spilleropgave', userId: 'trainer-1', playerId: 'player-1' })],
    }));

    const { getByTestId, queryByTestId } = render(<TasksScreen />);

    expect(getByTestId('tasks.folder.personal')).toBeTruthy();
    expect(queryByTestId('tasks.folder.trainer.trainer-1')).toBeNull();
  });

  it('filters tasks with search', () => {
    mockUseFootball.mockReturnValue(baseFootball({
      tasks: [
        baseTask({ id: 'pass-1', title: 'Pasning' }),
        baseTask({ id: 'sprint-1', title: 'Sprint' }),
      ],
    }));

    const { getByTestId, getByText, queryByText } = render(<TasksScreen />);

    fireEvent.changeText(getByTestId('tasks.searchInput'), 'pas');
    fireEvent.press(getByTestId('tasks.folder.personal'));

    expect(getByText('Pasning')).toBeTruthy();
    expect(queryByText('All activities')).toBeNull();
    expect(queryByText('Sprint')).toBeNull();
  });

  it('filters tasks by selected category', () => {
    mockUseFootball.mockReturnValue(baseFootball({
      tasks: [
        baseTask({ id: 'cat-pass', title: 'Pasning', categoryIds: ['cat-1'] }),
        baseTask({ id: 'cat-speed', title: 'Sprint', categoryIds: ['cat-2'] }),
      ],
      categories: [
        { id: 'cat-1', name: 'Teknik', color: '#00AAFF', emoji: '⚽️' },
        { id: 'cat-2', name: 'Styrke', color: '#EF4444', emoji: '💪' },
      ],
    }));

    const { getByTestId, getByText, queryByTestId, queryByText } = render(<TasksScreen />);

    fireEvent.press(getByTestId('tasks.categoryFilter.button'));
    fireEvent.press(getByTestId('tasks.categoryFilter.option.cat-1'));
    fireEvent.press(getByTestId('tasks.folder.personal'));

    expect(getByText('Pasning')).toBeTruthy();
    expect(queryByTestId('tasks.taskCategoryBadge.cat-pass.cat-1')).toBeTruthy();
    expect(queryByText('Sprint')).toBeNull();
  });

  it('filters task templates by selected focus tags', () => {
    mockUseFootball.mockReturnValue(baseFootball({
      tasks: [
        baseTask({ id: 'tag-pass', title: 'Pasning', focusAreas: ['Teknik', 'Boldkontrol'] }),
        baseTask({ id: 'tag-speed', title: 'Sprint', focus_areas: ['Fysisk'] }),
      ],
    }));

    const { getAllByText, getByTestId, getByText, queryByText } = render(<TasksScreen />);

    fireEvent.press(getByTestId('tasks.focusTagFilter.button'));
    fireEvent.press(getByTestId('tasks.focusTagFilter.option.technique'));
    fireEvent.press(getByTestId('tasks.folder.personal'));

    expect(getByTestId('tasks.taskFocusTags.tag-pass')).toBeTruthy();
    expect(getAllByText('Technique').length).toBeGreaterThan(0);
    expect(getByText('Pasning')).toBeTruthy();
    expect(queryByText('Sprint')).toBeNull();
  });

  it('shows compact auto-add status badges on task cards', () => {
    mockUseFootball.mockReturnValue(baseFootball({
      tasks: [
        baseTask({ id: 'auto-on', title: 'Auto aktiv', autoAddToActivities: true }),
        baseTask({ id: 'auto-off', title: 'Auto inaktiv', autoAddToActivities: false }),
      ],
    }));

    const { getByTestId, getByText } = render(<TasksScreen />);

    fireEvent.press(getByTestId('tasks.folder.personal'));

    expect(getByText('Auto aktiv')).toBeTruthy();
    expect(getByText('Auto inaktiv')).toBeTruthy();
    expect(getByTestId('tasks.template.autoAddBadge.auto-on').props.accessibilityLabel).toBe('Auto-add to activities: On');
    expect(getByTestId('tasks.template.autoAddBadge.auto-off').props.accessibilityLabel).toBe('Auto-add to activities: Off');
  });

  it('validates required title and video URL in the modal', () => {
    const { getByTestId, getByText } = render(<TasksScreen />);

    fireEvent.press(getByTestId('tasks.header.newTaskButton'));
    fireEvent.press(getByTestId('tasks.modal.saveButton'));
    expect(getByText('Title is required.')).toBeTruthy();

    fireEvent.changeText(getByTestId('tasks.modal.titleInput'), 'Video opgave');
    fireEvent.changeText(getByTestId('tasks.modal.videoUrlInput'), 'https://example.com/video');
    fireEvent.press(getByTestId('tasks.modal.saveButton'));

    expect(getByText('Invalid media. Use a video, image, or PDF link.')).toBeTruthy();
  });

  it('does not show subtasks and saves task templates without subtasks', async () => {
    const { getByTestId, queryByPlaceholderText, queryByTestId } = render(<TasksScreen />);

    fireEvent.press(getByTestId('tasks.header.newTaskButton'));
    expect(queryByPlaceholderText('Subtask')).toBeNull();
    expect(queryByTestId('tasks.modal.addSubtaskButton')).toBeNull();

    fireEvent.changeText(getByTestId('tasks.modal.titleInput'), 'Template uden delopgaver');
    fireEvent.press(getByTestId('tasks.modal.saveButton'));

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalledTimes(1));
    const createArg = mockCreateTask.mock.calls[0][0];
    expect(createArg.subtasks).toEqual([]);
    expect(createArg.task.subtasks).toEqual([]);
  });

  it('saves auto-add setting when creating a task template', async () => {
    const { getByTestId } = render(<TasksScreen />);

    fireEvent.press(getByTestId('tasks.header.newTaskButton'));
    fireEvent.changeText(getByTestId('tasks.modal.titleInput'), 'Template med auto-add');
    fireEvent(getByTestId('tasks.template.autoAddToggle'), 'valueChange', true);
    fireEvent.press(getByTestId('tasks.modal.saveButton'));

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalledTimes(1));
    const createArg = mockCreateTask.mock.calls[0][0];
    expect(createArg.task.autoAddToActivities).toBe(true);
    expect(createArg.task.auto_add_to_activities).toBe(true);
  });

  it('saves focus tags when creating a task template', async () => {
    mockUseFootball.mockReturnValue(baseFootball({
      tasks: [
        baseTask({ id: 'existing-focus', title: 'Eksisterende', focusAreas: ['Teknik'] }),
      ],
    }));

    const { getByTestId } = render(<TasksScreen />);

    fireEvent.press(getByTestId('tasks.header.newTaskButton'));
    fireEvent.changeText(getByTestId('tasks.modal.titleInput'), 'Template med fokus');
    fireEvent.press(getByTestId('tasks.modal.focusTag.suggestion.technique'));
    fireEvent.changeText(getByTestId('tasks.modal.focusTag.input'), 'Afslutning');
    fireEvent.press(getByTestId('tasks.modal.focusTag.add'));
    fireEvent.press(getByTestId('tasks.modal.saveButton'));

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalledTimes(1));
    const createArg = mockCreateTask.mock.calls[0][0];
    expect(createArg.task.focusAreas).toEqual(['Technique', 'Finishing']);
    expect(createArg.task.focus_areas).toEqual(['Technique', 'Finishing']);
  });

  it('saves auto-add setting when editing a task template', async () => {
    const updateTask = jest.fn().mockResolvedValue(undefined);
    mockUseFootball.mockReturnValue(baseFootball({
      updateTask,
      tasks: [
        baseTask({
          id: 'template-auto-edit',
          title: 'Auto edit',
          autoAddToActivities: false,
        }),
      ],
    }));

    const { getByTestId } = render(<TasksScreen />);

    fireEvent.press(getByTestId('tasks.folder.personal'));
    fireEvent.press(getByTestId('tasks.taskCard.template-auto-edit'));
    fireEvent(getByTestId('tasks.template.autoAddToggle'), 'valueChange', true);
    fireEvent.press(getByTestId('tasks.modal.saveButton'));

    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));
    expect(updateTask.mock.calls[0][1].autoAddToActivities).toBe(true);
    expect(updateTask.mock.calls[0][1].auto_add_to_activities).toBe(true);
  });

  it('shows delay options for reminder and feedback toggles', () => {
    const { getByTestId } = render(<TasksScreen />);

    fireEvent.press(getByTestId('tasks.header.newTaskButton'));
    fireEvent(getByTestId('tasks.modal.reminderToggle'), 'valueChange', true);
    expect(getByTestId('tasks.modal.reminderOption.15')).toBeTruthy();

    fireEvent(getByTestId('tasks.modal.feedbackToggle'), 'valueChange', true);
    expect(getByTestId('tasks.modal.feedbackDelayOption.15')).toBeTruthy();
  });

  it('renders category chips and reopens snake_case video_url in the editor', () => {
    mockUseFootball.mockReturnValue(baseFootball({
      tasks: [
        baseTask({
          id: 'template-video-1',
          title: 'YouTube template',
          categoryIds: ['cat-1'],
          video_url: 'https://youtu.be/abc123',
        }),
      ],
      categories: [
        { id: 'cat-1', name: 'Teknik', color: '#00AAFF', emoji: '⚽️' },
        { id: 'cat-2', name: 'Styrke', color: '#EF4444', emoji: '💪' },
      ],
    }));

    const { getAllByText, getByDisplayValue, getByTestId, getByText, queryByDisplayValue } = render(<TasksScreen />);

    fireEvent.press(getByTestId('tasks.folder.personal'));
    fireEvent.press(getByTestId('tasks.taskCard.template-video-1'));
    expect(getAllByText('Media').length).toBeGreaterThan(0);
    expect(getByText('Choose image, video, or PDF')).toBeTruthy();
    expect(getByDisplayValue('Media 1')).toBeTruthy();
    expect(getAllByText('YouTube').length).toBeGreaterThan(0);
    expect(queryByDisplayValue('https://youtu.be/abc123')).toBeNull();
    fireEvent.press(getByTestId('tasks.modal.categoryOption.1'));
    expect(getByTestId('tasks.modal.categoryOption.1')).toBeTruthy();
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

    const { getAllByText, getByDisplayValue, getByTestId, queryByDisplayValue } = render(<TasksScreen />);

    fireEvent.press(getByTestId('tasks.folder.personal'));
    fireEvent.press(getByTestId('tasks.taskCard.template-ig-1'));

    expect(getByDisplayValue('Media 1')).toBeTruthy();
    expect(getAllByText('Instagram').length).toBeGreaterThan(0);
    expect(queryByDisplayValue('https://www.instagram.com/reel/C7N2KQ2uV9x/?igsh=MWQ=')).toBeNull();
  });
});
