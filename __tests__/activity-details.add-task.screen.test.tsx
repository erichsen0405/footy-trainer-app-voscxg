import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import * as ActivityDetailsModule from '../app/activity-details';

const mockRefreshData = jest.fn().mockResolvedValue(undefined);
const mockSupabaseFrom = jest.fn();
const mockUpdateActivitySingle = jest.fn().mockResolvedValue(undefined);
const mockUpdateIntensityByCategory = jest.fn().mockResolvedValue(undefined);
const mockUpdateActivitySeries = jest.fn().mockResolvedValue(undefined);

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
});
