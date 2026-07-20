import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  PlayerProgramHomeCard,
  PlayerProgramsExperienceScreen,
} from '@/components/playerPrograms/PlayerProgramExperience';

jest.mock('@/components/TaskDetailsModal', () => ({
  __esModule: true,
  default: (props: { visible?: boolean }) => {
    const ReactModule = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');
    return props.visible ? ReactModule.createElement(View, { testID: 'taskDetails.mock' }) : null;
  },
}));

const mockPush = jest.fn();
const mockRefresh = jest.fn().mockResolvedValue(undefined);
const mockUsePlayerProgramExperience = jest.fn();
const mockSetCompletion = jest.fn().mockResolvedValue({});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/hooks/usePlayerProgramExperience', () => ({
  usePlayerProgramExperience: () => mockUsePlayerProgramExperience(),
}));

jest.mock('@/services/trainingProgramService', () => ({
  setPlayerProgramItemCompletion: (...args: unknown[]) => mockSetCompletion(...args),
}));

const experience = {
  apiVersion: 2,
  generatedAt: '2026-07-19T12:00:00.000Z',
  today: '2026-07-19',
  activeEnrollmentId: 'enrollment-1',
  nextAction: null,
  enrollments: [{
    id: 'enrollment-1',
    owner: { id: 'owner-1', ownerType: 'club', name: 'FC Test', displayName: 'FC Test', logoUrl: null, brandColors: { primary: '#123456', accent: '#22aa66' } },
    program: { id: 'program-1', title: 'First touch', description: 'Build confidence', durationWeeks: 4 },
    startDate: '2026-07-14',
    endDate: '2026-08-10',
    status: 'active',
    progress: { completedItems: 0, totalItems: 2, percent: 0 },
    nextItem: { id: 'item-task', scheduledDate: '2026-07-19', itemType: 'task_template', title: 'Ball mastery', phaseTitle: 'Foundation', weekNumber: 1, status: 'today', activityId: null, taskId: 'task-1' },
    items: [
      { id: 'item-task', scheduledDate: '2026-07-19', itemType: 'task_template', title: 'Ball mastery', phaseTitle: 'Foundation', weekNumber: 1, status: 'today', activityId: null, taskId: 'task-1' },
      { id: 'item-activity', scheduledDate: '2026-07-20', itemType: 'session_template', title: 'Pitch session', phaseTitle: 'Foundation', weekNumber: 1, status: 'upcoming', activityId: 'activity-1', taskId: null },
    ],
  }],
};

describe('player program experience screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePlayerProgramExperience.mockReturnValue({ experience, loading: false, refreshing: false, error: null, refresh: mockRefresh });
  });

  it('shows a clear no-program state without coach controls', () => {
    mockUsePlayerProgramExperience.mockReturnValue({ experience: { ...experience, activeEnrollmentId: null, enrollments: [] }, loading: false, refreshing: false, error: null, refresh: mockRefresh });
    const view = render(<PlayerProgramsExperienceScreen />);
    expect(view.getByTestId('playerPrograms.empty')).toBeTruthy();
    expect(view.queryByText('New')).toBeNull();
    expect(view.queryByText('Enroll')).toBeNull();
  });

  it('opens the active program from Home and shows the next action', () => {
    const view = render(<PlayerProgramHomeCard />);
    expect(view.getByText('First touch')).toBeTruthy();
    expect(view.getByText('Ball mastery')).toBeTruthy();
    fireEvent.press(view.getByTestId('home.playerProgram.open'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/programs');
  });

  it('completes standalone tasks server-side and opens activity items', async () => {
    const view = render(<PlayerProgramsExperienceScreen />);
    fireEvent.press(view.getByLabelText('Open Ball mastery'));
    expect(view.getByTestId('taskDetails.mock')).toBeTruthy();
    fireEvent.press(view.getByTestId('playerPrograms.item.item-task.complete'));
    await waitFor(() => expect(mockSetCompletion).toHaveBeenCalledWith('item-task', true));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    fireEvent.press(view.getByLabelText('Open Pitch session'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/activity-details', params: { id: 'activity-1', activityId: 'activity-1' } });
  });
});
