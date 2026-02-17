import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import * as ActivityDetailsModule from '../app/activity-details';

const mockRefreshData = jest.fn().mockResolvedValue(undefined);
const mockSupabaseFrom = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
}));

jest.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => ({ userRole: 'trainer' }),
}));

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => ({
    updateActivitySingle: jest.fn(),
    updateActivitySeries: jest.fn(),
    toggleTaskCompletion: jest.fn(),
    deleteActivityTask: jest.fn(),
    deleteActivitySingle: jest.fn(),
    deleteActivitySeries: jest.fn(),
    refreshData: mockRefreshData,
    createActivity: jest.fn(),
    duplicateActivity: jest.fn(),
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
  });
});
