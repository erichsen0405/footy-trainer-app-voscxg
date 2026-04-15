import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import * as ActivityDetailsModule from '../app/activity-details';
import { AssignActivityModal } from '@/components/AssignActivityModal';
import type { TaskTemplateSelfFeedback } from '@/types';

const mockRefreshData = jest.fn().mockResolvedValue(undefined);
const mockSupabaseFrom = jest.fn();
let mockTaskTemplates: any[] = [];
const mockUpdateActivitySingle = jest.fn().mockResolvedValue(undefined);
const mockUpdateIntensityByCategory = jest.fn().mockResolvedValue(undefined);
const mockUpdateActivitySeries = jest.fn().mockResolvedValue(undefined);
const mockFetchSelfFeedbackForActivities = jest.fn().mockResolvedValue([]);
const mockFetchSelfFeedbackForTemplates = jest.fn().mockResolvedValue([]);
const mockFetchLatestCategoryFeedback = jest.fn().mockResolvedValue([]);
const mockUpsertSelfFeedback = jest.fn();
const mockRouterPush = jest.fn();
const mockFetchActivityAssignments = jest.fn().mockResolvedValue({ playerIds: [], teamIds: [] });
const mockFetchActivityAssignmentState = jest.fn().mockResolvedValue({
  playerIds: [],
  teamIds: [],
  directPlayerIds: [],
  teamScopeByPlayerId: {},
});
const mockAssignActivity = jest.fn().mockResolvedValue({
  createdCount: 1,
  removedCount: 0,
  updatedCount: 0,
  skippedPlayerIds: [],
  skippedTeamIds: [],
  assignment: { playerIds: ['player-1'], teamIds: [] },
});
const mockGetTeamMembers = jest.fn().mockResolvedValue([
  {
    id: 'player-1',
    full_name: 'Spiller Test',
    phone_number: '11111111',
  },
]);
const teamPlayerMockPlayers = [
  {
    id: 'player-1',
    full_name: 'Spiller Test',
    phone_number: '11111111',
  },
];
const teamPlayerMockTeams = [
  {
    id: 'team-1',
    name: 'Hold Test',
    description: 'Beskrivelse',
  },
];

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
}));

jest.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => ({ userRole: 'trainer' }),
}));

jest.mock('@/contexts/TeamPlayerContext', () => ({
  useTeamPlayer: () => ({
    players: teamPlayerMockPlayers,
    teams: teamPlayerMockTeams,
    getTeamMembers: (...args: any[]) => mockGetTeamMembers(...args),
  }),
}));

jest.mock('@/services/activityAssignments', () => ({
  activityAssignmentsService: {
    fetchAssignments: (...args: any[]) => mockFetchActivityAssignments(...args),
    fetchAssignmentState: (...args: any[]) => mockFetchActivityAssignmentState(...args),
    assignActivity: (...args: any[]) => mockAssignActivity(...args),
  },
}));

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => ({
    updateActivitySingle: mockUpdateActivitySingle,
    updateIntensityByCategory: mockUpdateIntensityByCategory,
    updateActivitySeries: mockUpdateActivitySeries,
    toggleTaskCompletion: jest.fn(),
    deleteActivityTask: jest.fn(),
    deleteActivitySingle: jest.fn(),
    deleteActivitySeries: jest.fn(),
    refreshData: mockRefreshData,
    createActivity: jest.fn(),
    duplicateActivity: jest.fn(),
    tasks: mockTaskTemplates,
  }),
}));

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockSupabaseFrom(...args),
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1' } } },
        error: null,
      }),
    },
  },
}));

jest.mock('@/services/feedbackService', () => ({
  fetchSelfFeedbackForActivities: (...args: any[]) => mockFetchSelfFeedbackForActivities(...args),
  fetchSelfFeedbackForTemplates: (...args: any[]) => mockFetchSelfFeedbackForTemplates(...args),
  fetchLatestCategoryFeedback: (...args: any[]) => mockFetchLatestCategoryFeedback(...args),
  upsertSelfFeedback: (...args: any[]) => mockUpsertSelfFeedback(...args),
}));

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
    IconSymbol: ({ ios_icon_name, android_material_icon_name }: any) => (
      <Text>{ios_icon_name ?? android_material_icon_name ?? 'icon'}</Text>
    ),
  };
});

jest.mock('@/components/TaskDescriptionRenderer', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    TaskDescriptionRenderer: ({ description }: { description?: string }) => <Text>{description ?? ''}</Text>,
  };
});

jest.mock('@/components/TaskScoreNoteModal', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    TaskScoreNoteModal: () => <View />,
  };
});

jest.mock('@/components/TaskDetailsModal', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return () => <View />;
});

jest.mock('@/components/CreateActivityTaskModal', () => {
  const React = jest.requireActual('react');
  const { TouchableOpacity, Text, View } = jest.requireActual('react-native');
  return {
    CreateActivityTaskModal: ({ visible, onTaskCreated }: any) =>
      visible ? (
        <View testID="mock.createActivityTaskModal">
          <TouchableOpacity
            testID="mock.createActivityTaskModal.complete"
            onPress={() => {
              void onTaskCreated?.();
            }}
          >
            <Text>CompleteCreateTask</Text>
          </TouchableOpacity>
        </View>
      ) : null,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));

describe('ActivityDetails add-task flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTaskTemplates = [];
    mockFetchSelfFeedbackForActivities.mockResolvedValue([]);
    mockFetchSelfFeedbackForTemplates.mockResolvedValue([]);
    mockFetchLatestCategoryFeedback.mockResolvedValue([]);
    mockFetchActivityAssignments.mockResolvedValue({ playerIds: [], teamIds: [] });
    mockFetchActivityAssignmentState.mockResolvedValue({
      playerIds: [],
      teamIds: [],
      directPlayerIds: [],
      teamScopeByPlayerId: {},
    });
    mockAssignActivity.mockResolvedValue({
      createdCount: 1,
      removedCount: 0,
      updatedCount: 0,
      skippedPlayerIds: [],
      skippedTeamIds: [],
      assignment: { playerIds: ['player-1'], teamIds: [] },
    });
    mockGetTeamMembers.mockResolvedValue([
      {
        id: 'player-1',
        full_name: 'Spiller Test',
        phone_number: '11111111',
      },
    ]);
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table !== 'activities') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }

      const builder: any = {
        select: () => builder,
        eq: () => builder,
        single: async () => ({
          data: {
            id: 'activity-1',
            title: 'Session',
            activity_date: '2026-02-10',
            activity_time: '10:00',
            activity_end_time: null,
            location: 'Pitch',
            category_id: 'cat-1',
            intensity: null,
            intensity_enabled: false,
            intensity_note: null,
            is_external: false,
            external_calendar_id: null,
            external_event_id: null,
            series_id: null,
            series_instance_date: null,
            activity_categories: {
              id: 'cat-1',
              name: 'Training',
              color: '#123456',
              emoji: '⚽️',
            },
            activity_tasks: [
              {
                id: 'task-1',
                title: 'Ny opgave',
                description: 'Beskrivelse',
                completed: false,
                reminder_minutes: null,
                task_template_id: null,
                feedback_template_id: null,
              },
            ],
          },
          error: null,
        }),
      };
      return builder;
    });
  });

  it('shows add CTA and updates task list after task-created refetch', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const manualButton = Array.isArray(buttons)
        ? (buttons as any[]).find((button) => button?.text === 'Opret manuelt')
        : null;
      manualButton?.onPress?.();
    });

    const baseActivity = {
      id: 'activity-1',
      title: 'Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: {
        id: 'cat-1',
        name: 'Training',
        color: '#123456',
        emoji: '⚽️',
      },
      tasks: [],
      isExternal: false,
      intensityEnabled: false,
      intensity: null,
    };

    const { getByTestId, findByTestId } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={baseActivity as any}
        categories={[baseActivity.category as any]}
        isAdmin
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('activity.addTaskButton'));
    fireEvent.press(getByTestId('mock.createActivityTaskModal.complete'));
    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledWith('activities'));
    expect(await findByTestId('activity.taskRow.task-1')).toBeTruthy();
    alertSpy.mockRestore();
  });

  it('shows latest feedback loading placeholder while data is being fetched', async () => {
    let resolveLatestFeedback: ((rows: TaskTemplateSelfFeedback[]) => void) | null = null;
    const latestFeedbackPromise = new Promise<TaskTemplateSelfFeedback[]>((resolve) => {
      resolveLatestFeedback = resolve;
    });
    mockFetchLatestCategoryFeedback.mockReturnValueOnce(latestFeedbackPromise);

    const activity = {
      id: 'activity-feedback-loading-1',
      title: 'Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: { id: 'cat-1', name: 'Training', color: '#123456', emoji: '⚽️' },
      tasks: [],
      isExternal: false,
      intensityEnabled: false,
      intensity: null,
    };

    const { getByTestId, queryByTestId } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={activity as any}
        categories={[activity.category as any]}
        isAdmin
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />,
    );

    await waitFor(() => expect(getByTestId('activity.details.latestFeedback.loading')).toBeTruthy());

    await act(async () => {
      resolveLatestFeedback?.([]);
      await Promise.resolve();
    });

    await waitFor(() => expect(queryByTestId('activity.details.latestFeedback.loading')).toBeNull());
  });

  it('shows latest feedback empty state when category has no feedback', async () => {
    mockFetchLatestCategoryFeedback.mockResolvedValueOnce([]);

    const activity = {
      id: 'activity-feedback-empty-1',
      title: 'Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: { id: 'cat-1', name: 'Training', color: '#123456', emoji: '⚽️' },
      tasks: [],
      isExternal: false,
      intensityEnabled: false,
      intensity: null,
    };

    const { findByTestId, findByText } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={activity as any}
        categories={[activity.category as any]}
        isAdmin
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />,
    );

    expect(await findByTestId('activity.details.latestFeedback.empty')).toBeTruthy();
    expect(await findByText('Ingen feedback endnu i denne kategori.')).toBeTruthy();
  });

  it('shows latest feedback item with both score and note when data is loaded', async () => {
    mockFetchLatestCategoryFeedback.mockResolvedValueOnce([
      {
        id: 'feedback-1',
        userId: 'user-1',
        taskTemplateId: 'tpl-1',
        taskInstanceId: 'task-1',
        activityId: 'activity-old-1',
        rating: 4,
        note: 'Hold fokus pa forste beroring.',
        focusPointTitle: 'Forste beroring',
        createdAt: '2026-02-20T09:00:00.000Z',
        updatedAt: '2026-02-20T09:00:00.000Z',
      },
    ]);

    const activity = {
      id: 'activity-feedback-loaded-1',
      title: 'Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: { id: 'cat-1', name: 'Training', color: '#123456', emoji: '⚽️' },
      tasks: [],
      isExternal: false,
      intensityEnabled: false,
      intensity: null,
    };

    const { findByText } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={activity as any}
        categories={[activity.category as any]}
        isAdmin
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />,
    );

    expect(await findByText('Seneste feedback')).toBeTruthy();
    expect(await findByText('Forste beroring')).toBeTruthy();
    expect(await findByText('Score 4/5')).toBeTruthy();
    expect(await findByText('Hold fokus pa forste beroring.')).toBeTruthy();
  });

  it('can collapse latest feedback section', async () => {
    mockFetchLatestCategoryFeedback.mockResolvedValueOnce([
      {
        id: 'feedback-collapse-1',
        userId: 'user-1',
        taskTemplateId: 'tpl-1',
        taskInstanceId: 'task-1',
        activityId: 'activity-old-1',
        rating: 3,
        note: 'Skub bolden frem i lobet.',
        focusPointTitle: 'Boldkontrol',
        createdAt: '2026-02-20T09:00:00.000Z',
        updatedAt: '2026-02-20T09:00:00.000Z',
      },
    ]);

    const activity = {
      id: 'activity-feedback-collapse-1',
      title: 'Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: { id: 'cat-1', name: 'Training', color: '#123456', emoji: '⚽️' },
      tasks: [],
      isExternal: false,
      intensityEnabled: false,
      intensity: null,
    };

    const { findByText, getByTestId, queryByText } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={activity as any}
        categories={[activity.category as any]}
        isAdmin
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />,
    );

    expect(await findByText('Skub bolden frem i lobet.')).toBeTruthy();
    fireEvent.press(getByTestId('activity.details.latestFeedback.toggle'));
    await waitFor(() => expect(queryByText('Skub bolden frem i lobet.')).toBeNull());
  });

  it('shows deep-link loader and fetches tasks after render when task is missing at mount', async () => {
    let resolveActivityFetch: ((value: any) => void) | null = null;
    const activityFetchPromise = new Promise((resolve) => {
      resolveActivityFetch = resolve;
    });

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table !== 'activities') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }

      const builder: any = {
        select: () => builder,
        eq: () => builder,
        single: () => activityFetchPromise,
      };
      return builder;
    });

    const baseActivity = {
      id: 'activity-deeplink-1',
      title: 'Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: {
        id: 'cat-1',
        name: 'Training',
        color: '#123456',
        emoji: '⚽️',
      },
      tasks: [],
      isExternal: false,
      intensityEnabled: false,
      intensity: null,
    };

    const { getByTestId, queryByTestId } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={baseActivity as any}
        categories={[baseActivity.category as any]}
        isAdmin
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
        initialOpenTaskId="task-deeplink-1"
      />,
    );

    await waitFor(() => expect(getByTestId('activity.details.taskLookup.loading')).toBeTruthy());

    await act(async () => {
      resolveActivityFetch?.({
        data: {
          id: 'activity-deeplink-1',
          title: 'Session',
          activity_date: '2026-02-10',
          activity_time: '10:00',
          activity_end_time: null,
          location: 'Pitch',
          category_id: 'cat-1',
          intensity: null,
          intensity_enabled: false,
          intensity_note: null,
          is_external: false,
          external_calendar_id: null,
          external_event_id: null,
          series_id: null,
          series_instance_date: null,
          activity_categories: {
            id: 'cat-1',
            name: 'Training',
            color: '#123456',
            emoji: '⚽️',
          },
          activity_tasks: [
            {
              id: 'task-deeplink-1',
              title: 'Deep link opgave',
              description: 'Synlig efter refresh',
              completed: false,
              reminder_minutes: null,
              task_template_id: null,
              feedback_template_id: null,
            },
          ],
        },
        error: null,
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(getByTestId('activity.details.task.loaded.task-deeplink-1')).toBeTruthy());
    expect(queryByTestId('activity.details.taskLookup.error')).toBeNull();
  });

  it('shows deep-link error state with back CTA when task cannot be loaded', async () => {
    const onBack = jest.fn();
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table !== 'activities') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }

      const builder: any = {
        select: () => builder,
        eq: () => builder,
        single: async () => ({
          data: {
            id: 'activity-deeplink-2',
            title: 'Session',
            activity_date: '2026-02-10',
            activity_time: '10:00',
            activity_end_time: null,
            location: 'Pitch',
            category_id: 'cat-1',
            intensity: null,
            intensity_enabled: false,
            intensity_note: null,
            is_external: false,
            external_calendar_id: null,
            external_event_id: null,
            series_id: null,
            series_instance_date: null,
            activity_categories: {
              id: 'cat-1',
              name: 'Training',
              color: '#123456',
              emoji: '⚽️',
            },
            activity_tasks: [],
          },
          error: null,
        }),
      };
      return builder;
    });

    const baseActivity = {
      id: 'activity-deeplink-2',
      title: 'Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: {
        id: 'cat-1',
        name: 'Training',
        color: '#123456',
        emoji: '⚽️',
      },
      tasks: [],
      isExternal: false,
      intensityEnabled: false,
      intensity: null,
    };

    const { getByTestId } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={baseActivity as any}
        categories={[baseActivity.category as any]}
        isAdmin
        isDark={false}
        onBack={onBack}
        onActivityUpdated={jest.fn()}
        initialOpenTaskId="missing-task-id"
      />,
    );

    await waitFor(() => expect(getByTestId('activity.details.taskLookup.error')).toBeTruthy());
    fireEvent.press(getByTestId('activity.details.taskLookup.backButton'));
    expect(onBack).toHaveBeenCalled();
  });

  it('keeps edit inputs stable while typing continuous text', () => {
    const baseActivity = {
      id: 'activity-edit-typing-1',
      title: 'Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: {
        id: 'cat-1',
        name: 'Training',
        color: '#123456',
        emoji: '⚽️',
      },
      tasks: [],
      isExternal: false,
      intensityEnabled: false,
      intensity: null,
    };

    const onActivityUpdated = jest.fn();
    const { getByTestId, rerender } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={baseActivity as any}
        categories={[baseActivity.category as any]}
        isAdmin
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={onActivityUpdated}
      />,
    );

    fireEvent.press(getByTestId('activity.details.editButton'));

    const titleInput = getByTestId('activity.details.edit.titleInput');
    fireEvent.changeText(titleInput, 'a');
    rerender(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={{ ...baseActivity } as any}
        categories={[baseActivity.category as any]}
        isAdmin
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={onActivityUpdated}
      />,
    );

    fireEvent.changeText(getByTestId('activity.details.edit.titleInput'), 'ab');
    rerender(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={{ ...baseActivity } as any}
        categories={[baseActivity.category as any]}
        isAdmin
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={onActivityUpdated}
      />,
    );

    fireEvent.changeText(getByTestId('activity.details.edit.titleInput'), 'abc');
    expect(getByTestId('activity.details.edit.titleInput').props.value).toBe('abc');

    fireEvent.changeText(getByTestId('activity.details.edit.locationInput'), 'abc');
    expect(getByTestId('activity.details.edit.locationInput').props.value).toBe('abc');
  });

  it('reverts intensity toggle on cancel from category modal', async () => {
    const sampleActivity = {
      id: 'activity-plain-1',
      title: 'Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: {
        id: 'cat-1',
        name: 'Training',
        color: '#123456',
        emoji: '⚽️',
      },
      tasks: [],
      isExternal: false,
      intensityEnabled: false,
      intensity: null,
    };

    const { getByTestId, queryByTestId } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={sampleActivity as any}
        categories={[sampleActivity.category as any]}
        isAdmin
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />
    );

    fireEvent.press(getByTestId('activity.details.editButton'));
    fireEvent(getByTestId('activity.details.edit.intensityToggle'), 'valueChange', true);
    expect(getByTestId('activity.details.intensityScopeModal')).toBeTruthy();

    fireEvent.press(getByTestId('activity.details.intensityScopeModal.cancel'));
    expect(queryByTestId('activity.details.intensityScopeModal')).toBeNull();
    expect(getByTestId('activity.details.edit.intensityToggle').props.value).toBe(false);
  });

  it('applies external intensity to category when user confirms "til alle"', async () => {
    const externalActivity = {
      id: 'external-meta-2',
      title: 'External Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: {
        id: 'cat-1',
        name: 'Training',
        color: '#123456',
        emoji: '⚽️',
      },
      tasks: [],
      isExternal: true,
      intensityEnabled: false,
      intensity: null,
    };

    const { getByTestId } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={externalActivity as any}
        categories={[externalActivity.category as any]}
        isAdmin
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />
    );

    fireEvent.press(getByTestId('activity.details.editButton'));
    fireEvent(getByTestId('activity.details.edit.intensityToggle'), 'valueChange', true);
    fireEvent.press(getByTestId('activity.details.intensityScopeModal.all'));
    fireEvent.press(getByTestId('activity.details.saveEditButton'));

    await waitFor(() =>
      expect(mockUpdateIntensityByCategory).toHaveBeenCalledWith('cat-1', true)
    );
    await waitFor(() => expect(mockUpdateActivitySingle).toHaveBeenCalled());
    const externalUpdatePayload = mockUpdateActivitySingle.mock.calls.find(
      (call) => call?.[0] === 'external-meta-2'
    )?.[1];
    expect(externalUpdatePayload).toEqual(
      expect.objectContaining({
        categoryId: 'cat-1',
      })
    );
    expect(externalUpdatePayload).not.toHaveProperty('intensityEnabled');
    expect(externalUpdatePayload).not.toHaveProperty('intensity');
  });

  it('applies intensity by category for internal non-series activities', async () => {
    const internalActivity = {
      id: 'activity-internal-2',
      title: 'Internal Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: {
        id: 'cat-1',
        name: 'Training',
        color: '#123456',
        emoji: '⚽️',
      },
      tasks: [],
      isExternal: false,
      intensityEnabled: false,
      intensity: null,
    };

    const { getByTestId } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={internalActivity as any}
        categories={[internalActivity.category as any]}
        isAdmin
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />
    );

    fireEvent.press(getByTestId('activity.details.editButton'));
    fireEvent(getByTestId('activity.details.edit.intensityToggle'), 'valueChange', true);
    fireEvent.press(getByTestId('activity.details.intensityScopeModal.all'));
    fireEvent.press(getByTestId('activity.details.saveEditButton'));

    await waitFor(() =>
      expect(mockUpdateIntensityByCategory).toHaveBeenCalledWith('cat-1', true)
    );
    await waitFor(() => expect(mockUpdateActivitySingle).toHaveBeenCalled());
    const internalUpdatePayload = mockUpdateActivitySingle.mock.calls.find(
      (call) => call?.[0] === 'activity-internal-2'
    )?.[1];
    expect(internalUpdatePayload).toEqual(
      expect.objectContaining({
        categoryId: 'cat-1',
      })
    );
    expect(internalUpdatePayload).not.toHaveProperty('intensityEnabled');
    expect(internalUpdatePayload).not.toHaveProperty('intensity');
  });

  it('does not propagate intensity via series edit scope and uses category apply instead', async () => {
    const seriesActivity = {
      id: 'activity-series-1',
      title: 'Serie aktivitet',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: {
        id: 'cat-1',
        name: 'Training',
        color: '#123456',
        emoji: '⚽️',
      },
      tasks: [],
      isExternal: false,
      seriesId: 'series-1',
      intensityEnabled: false,
      intensity: null,
    };

    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((...args: any[]) => {
        const [title, _msg, buttons] = args;
        if (title === 'Rediger serie') {
          const seriesButton = (buttons || []).find((button: any) => button?.text === 'Hele serien');
          seriesButton?.onPress?.();
        }
      });

    const { getByTestId } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={seriesActivity as any}
        categories={[seriesActivity.category as any]}
        isAdmin
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />
    );

    fireEvent.press(getByTestId('activity.details.editButton'));
    fireEvent(getByTestId('activity.details.edit.intensityToggle'), 'valueChange', true);
    fireEvent.press(getByTestId('activity.details.intensityScopeModal.all'));
    fireEvent.press(getByTestId('activity.details.saveEditButton'));

    await waitFor(() => expect(mockUpdateIntensityByCategory).toHaveBeenCalledWith('cat-1', true));
    await waitFor(() => expect(mockUpdateActivitySeries).toHaveBeenCalled());
    expect(mockUpdateActivitySeries).toHaveBeenCalledWith(
      'series-1',
      expect.not.objectContaining({
        intensityEnabled: expect.anything(),
        intensity: expect.anything(),
      })
    );

    alertSpy.mockRestore();
  });

  it('opens canonical feedback modal route from Activity Details', async () => {
    const feedbackTemplateId = '11111111-1111-1111-1111-111111111111';
    const activity = {
      id: 'activity-feedback-route-1',
      title: 'Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: { id: 'cat-1', name: 'Training', color: '#123456', emoji: '⚽️' },
      tasks: [
        {
          id: 'feedback-task-details-1',
          title: 'Feedback på Demo',
          completed: false,
          feedback_template_id: feedbackTemplateId,
        },
      ],
      isExternal: false,
      intensityEnabled: false,
      intensity: null,
    };

    const { getByTestId } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={activity as any}
        categories={[activity.category as any]}
        isAdmin
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('activity.details.feedbackTaskButton.incomplete'));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(modals)/task-feedback-note',
      params: {
        activityId: 'activity-feedback-route-1',
        templateId: feedbackTemplateId,
        title: 'Feedback på Demo',
        taskInstanceId: 'feedback-task-details-1',
      },
    });
  });

  it('opens canonical intensity modal route from Activity Details', async () => {
    const activity = {
      id: 'activity-intensity-route-1',
      title: 'Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: { id: 'cat-1', name: 'Training', color: '#123456', emoji: '⚽️' },
      tasks: [],
      isExternal: false,
      intensityEnabled: true,
      intensity: null,
    };

    const { getByTestId } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={activity as any}
        categories={[activity.category as any]}
        isAdmin
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />,
    );

    fireEvent(getByTestId('activity.details.intensityTaskButton'), 'press', {
      stopPropagation: jest.fn(),
    });

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(modals)/task-score-note',
      params: {
        activityId: 'activity-intensity-route-1',
        initialScore: '',
      },
    });
  });

  it('shows assign section only for trainer profiles', () => {
    const activity = {
      id: 'activity-assign-gating-1',
      title: 'Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: { id: 'cat-1', name: 'Training', color: '#123456', emoji: '⚽️' },
      tasks: [],
      isExternal: false,
      intensityEnabled: false,
      intensity: null,
    };

    const trainerView = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={activity as any}
        categories={[activity.category as any]}
        isAdmin
        isTrainerProfile
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />,
    );

    expect(trainerView.getByTestId('activity.assign.openModalButton')).toBeTruthy();

    const playerView = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={activity as any}
        categories={[activity.category as any]}
        isAdmin={false}
        isTrainerProfile={false}
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />,
    );

    expect(playerView.queryByTestId('activity.assign.openModalButton')).toBeNull();
  });

  it.skip('synchronizes team and player selection in assign modal and saves selected team', async () => {
    let assignmentLookup = { playerIds: [] as string[], teamIds: [] as string[] };
    let assignmentState = {
      playerIds: [] as string[],
      teamIds: [] as string[],
      directPlayerIds: [] as string[],
      teamScopeByPlayerId: {} as Record<string, string | null>,
    };
    mockFetchActivityAssignments.mockImplementation(() => assignmentLookup);
    mockFetchActivityAssignmentState.mockImplementation(() => assignmentState);
    mockGetTeamMembers.mockImplementation(() => teamPlayerMockPlayers);
    mockAssignActivity.mockImplementationOnce(async () => {
      assignmentLookup = { playerIds: ['player-1'], teamIds: ['team-1'] };
      assignmentState = {
        playerIds: ['player-1'],
        teamIds: ['team-1'],
        directPlayerIds: [],
        teamScopeByPlayerId: { 'player-1': 'team-1' },
      };
      return {
        createdCount: 1,
        removedCount: 0,
        updatedCount: 0,
        skippedPlayerIds: [],
        skippedTeamIds: [],
        assignment: assignmentLookup,
      };
    });

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onClose = jest.fn();
    const onSuccess = jest.fn();

    const { getByTestId, findByTestId } = render(
      <AssignActivityModal
        visible
        activity={{
          id: 'activity-assign-flow-1',
          title: 'Session',
          isExternal: false,
          externalEventRowId: null,
          categoryId: 'cat-1',
          intensity: null,
          intensityEnabled: false,
          intensityNote: null,
        }}
        trainerId="user-1"
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await findByTestId('activity.assign.modal')).toBeTruthy();
    expect(getByTestId('activity.assign.list.players')).toBeTruthy();

    fireEvent.press(getByTestId('activity.assign.tab.teams'));
    expect(getByTestId('activity.assign.list.teams')).toBeTruthy();
    expect(await findByTestId('activity.assign.team.member.team-1.player-1')).toBeTruthy();
    fireEvent.press(getByTestId('activity.assign.row.team.team-1'));
    expect(await findByTestId('activity.assign.row.selected.team.team-1')).toBeTruthy();

    fireEvent.press(getByTestId('activity.assign.tab.players'));
    expect(await findByTestId('activity.assign.row.selected.player.player-1')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId('activity.assign.saveButton'));
    });

    await waitFor(() =>
      expect(mockAssignActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          activityId: 'activity-assign-flow-1',
          playerIds: [],
          teamIds: ['team-1'],
        }),
      ),
    );
    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith({
        createdCount: 1,
        assignedPlayerCount: 1,
        assignedTeamCount: 1,
      }),
    );
    expect(onClose).toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it.skip('allows trainer to remove an assigned team from activity and saves empty selection', async () => {
    let assignmentLookup = { playerIds: ['player-1'] as string[], teamIds: ['team-1'] as string[] };
    let assignmentState = {
      playerIds: ['player-1'] as string[],
      teamIds: ['team-1'] as string[],
      directPlayerIds: [] as string[],
      teamScopeByPlayerId: { 'player-1': 'team-1' } as Record<string, string | null>,
    };
    mockFetchActivityAssignments.mockImplementation(() => assignmentLookup);
    mockFetchActivityAssignmentState.mockImplementation(() => assignmentState);
    mockGetTeamMembers.mockImplementation(() => teamPlayerMockPlayers);
    mockAssignActivity.mockImplementationOnce(async () => {
      assignmentLookup = { playerIds: [], teamIds: [] };
      assignmentState = {
        playerIds: [],
        teamIds: [],
        directPlayerIds: [],
        teamScopeByPlayerId: {},
      };
      return {
        createdCount: 0,
        removedCount: 1,
        updatedCount: 0,
        skippedPlayerIds: [],
        skippedTeamIds: [],
        assignment: assignmentLookup,
      };
    });

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onClose = jest.fn();
    const onSuccess = jest.fn();

    const { getByTestId, queryByTestId, findByText } = render(
      <AssignActivityModal
        visible
        activity={{
          id: 'activity-assign-remove-1',
          title: 'Session',
          isExternal: false,
          externalEventRowId: null,
          categoryId: 'cat-1',
          intensity: null,
          intensityEnabled: false,
          intensityNote: null,
        }}
        trainerId="user-1"
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.press(getByTestId('activity.assign.tab.teams'));
    expect(await findByText('Hold Test')).toBeTruthy();
    await waitFor(() =>
      expect(queryByTestId('activity.assign.row.selected.team.team-1')).toBeTruthy(),
    );

    fireEvent.press(getByTestId('activity.assign.row.team.team-1'));
    await waitFor(() =>
      expect(queryByTestId('activity.assign.row.selected.team.team-1')).toBeNull(),
    );
    await act(async () => {
      fireEvent.press(getByTestId('activity.assign.saveButton'));
    });

    await waitFor(() =>
      expect(mockAssignActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          activityId: 'activity-assign-remove-1',
          playerIds: [],
          teamIds: [],
        }),
      ),
    );
    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith({
        createdCount: 0,
        assignedPlayerCount: 0,
        assignedTeamCount: 0,
      }),
    );
    expect(onClose).toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('shows trainer-assigned badge for player, hides activity edit, and uses the same add-task chooser', async () => {
    const activity = {
      id: 'activity-player-assigned-1',
      title: 'Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: { id: 'cat-1', name: 'Training', color: '#123456', emoji: '⚽️' },
      tasks: [
        {
          id: 'task-lock-1',
          title: 'Opgave',
          description: '',
          completed: false,
        },
      ],
      isExternal: false,
      intensityEnabled: true,
      intensity: null,
      user_id: 'trainer-1',
      player_id: 'user-1',
      team_id: null,
    };

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByTestId, queryByTestId, findByTestId } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={activity as any}
        categories={[activity.category as any]}
        isAdmin={false}
        isTrainerProfile={false}
        isPlayerProfile
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />,
    );

    expect(getByTestId('activity.details.trainerAssignedBadge')).toBeTruthy();
    expect(queryByTestId('activity.details.editButton')).toBeNull();
    expect(queryByTestId('activity.details.task.edit.task-lock-1')).toBeNull();

    fireEvent.press(getByTestId('activity.addTaskButton'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Tilføj opgave',
      'Vælg hvordan du vil oprette opgaven.',
      expect.any(Array),
    );

    const buttons = alertSpy.mock.calls[0]?.[2] as any[];
    const manualButton = buttons.find((button) => button?.text === 'Opret manuelt');
    manualButton?.onPress?.();

    expect(await findByTestId('mock.createActivityTaskModal')).toBeTruthy();

    alertSpy.mockRestore();
  });

  it('allows player on trainer-assigned activity to choose template task flow', async () => {
    const activity = {
      id: 'activity-player-assigned-template-1',
      title: 'Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: { id: 'cat-1', name: 'Training', color: '#123456', emoji: '⚽️' },
      tasks: [],
      isExternal: false,
      intensityEnabled: true,
      intensity: null,
      user_id: 'trainer-1',
      player_id: 'user-1',
      team_id: null,
    };

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const templateButton = Array.isArray(buttons)
        ? (buttons as any[]).find((button) => button?.text === 'Opret fra skabelon')
        : null;
      templateButton?.onPress?.();
    });

    const { getByTestId, findByText, queryByTestId } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={activity as any}
        categories={[activity.category as any]}
        isAdmin={false}
        isTrainerProfile={false}
        isPlayerProfile
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('activity.addTaskButton'));

    expect(await findByText('Vælg opgaveskabelon')).toBeTruthy();
    expect(queryByTestId('mock.createActivityTaskModal')).toBeNull();

    alertSpy.mockRestore();
  });

  it('preserves the template video url when creating a task directly from a template', async () => {
    const instagramUrl = 'https://www.instagram.com/reel/C7N2KQ2uV9x/?igsh=MWQ=';
    mockTaskTemplates = [
      {
        id: 'template-source-1',
        title: 'Instagram Reel',
        description: 'Se videoen',
        completed: false,
        isTemplate: true,
        categoryIds: [],
        subtasks: [],
        videoUrl: instagramUrl,
      },
    ];

    const insertedTaskTemplates: Record<string, any>[] = [];
    const insertedActivityTasks: Record<string, any>[] = [];
    const defaultSupabaseFrom = mockSupabaseFrom.getMockImplementation();

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'task_templates') {
        const builder: any = {
          insert: (payload: Record<string, any>) => {
            insertedTaskTemplates.push(payload);
            return builder;
          },
          select: () => builder,
          eq: () => builder,
          in: async (_column: string, ids: string[]) => ({
            data: ids.map((id) => ({ id, archived_at: null })),
            error: null,
          }),
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({
            data: { id: 'local-template-1' },
            error: null,
          }),
        };
        return builder;
      }

      if (table === 'activity_tasks') {
        const builder: any = {
          insert: (payload: Record<string, any>) => {
            insertedActivityTasks.push(payload);
            return builder;
          },
          select: () => builder,
          eq: async () => ({
            data: insertedActivityTasks.map((row, index) => ({
              id: `created-task-${index + 1}`,
              title: row.title,
              description: row.description,
              completed: row.completed ?? false,
              reminder_minutes: row.reminder_minutes ?? null,
              task_template_id: row.task_template_id ?? null,
              feedback_template_id: row.feedback_template_id ?? null,
              video_url: row.video_url ?? null,
            })),
            error: null,
          }),
          single: async () => ({
            data: insertedActivityTasks.at(-1) ?? null,
            error: null,
          }),
        };
        return builder;
      }

      if (table === 'activities') {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          single: async () => ({
            data: {
              id: 'activity-template-video-1',
              title: 'Session',
              activity_date: '2026-02-10',
              activity_time: '10:00',
              activity_end_time: null,
              location: 'Pitch',
              category_id: 'cat-1',
              intensity: null,
              intensity_enabled: false,
              intensity_note: null,
              is_external: false,
              external_calendar_id: null,
              external_event_id: null,
              series_id: null,
              series_instance_date: null,
              activity_categories: {
                id: 'cat-1',
                name: 'Training',
                color: '#123456',
                emoji: '⚽️',
              },
              activity_tasks: insertedActivityTasks.map((row, index) => ({
                id: `created-task-${index + 1}`,
                title: row.title,
                description: row.description,
                completed: row.completed ?? false,
                reminder_minutes: row.reminder_minutes ?? null,
                task_template_id: row.task_template_id ?? null,
                feedback_template_id: row.feedback_template_id ?? null,
                video_url: row.video_url ?? null,
              })),
            },
            error: null,
          }),
        };
        return builder;
      }

      return defaultSupabaseFrom?.(table);
    });

    const activity = {
      id: 'activity-template-video-1',
      title: 'Session',
      date: new Date('2026-02-10T10:00:00.000Z'),
      time: '10:00',
      location: 'Pitch',
      category: { id: 'cat-1', name: 'Training', color: '#123456', emoji: '⚽️' },
      tasks: [],
      isExternal: false,
      intensityEnabled: false,
      intensity: null,
      user_id: 'user-1',
      player_id: null,
      team_id: null,
    };

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const templateButton = Array.isArray(buttons)
        ? (buttons as any[]).find((button) => button?.text === 'Opret fra skabelon')
        : null;
      templateButton?.onPress?.();
    });

    const { getByTestId, findByText, getByText } = render(
      <ActivityDetailsModule.ActivityDetailsContent
        activity={activity as any}
        categories={[activity.category as any]}
        isAdmin
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('activity.addTaskButton'));
    expect(await findByText('Vælg opgaveskabelon')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByText('Instagram Reel'));
      await Promise.resolve();
    });

    await waitFor(() => expect(insertedTaskTemplates).toHaveLength(1));
    expect(insertedTaskTemplates[0].video_url).toBe(instagramUrl);
    expect(insertedActivityTasks).toHaveLength(1);
    expect(insertedActivityTasks[0].video_url).toBe(instagramUrl);

    alertSpy.mockRestore();
  });
});
