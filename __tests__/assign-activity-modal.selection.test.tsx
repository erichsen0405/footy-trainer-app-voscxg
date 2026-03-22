import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { AssignActivityModal } from '@/components/AssignActivityModal';

const mockFetchActivityAssignmentState = jest.fn();
const mockAssignActivity = jest.fn();
const mockGetTeamMembers = jest.fn();

const mockPlayers = [
  {
    id: 'player-1',
    full_name: 'Spiller Test',
    phone_number: '11111111',
  },
  {
    id: 'player-2',
    full_name: 'Spiller To',
    phone_number: '22222222',
  },
];

const mockTeams = [
  {
    id: 'team-1',
    name: 'Hold Test',
    description: 'Beskrivelse',
  },
];

const mockTeamPlayerContextValue = {
  players: mockPlayers,
  teams: mockTeams,
  getTeamMembers: (...args: any[]) => mockGetTeamMembers(...args),
  ensureRosterLoaded: jest.fn().mockResolvedValue({
    players: mockPlayers,
    teams: mockTeams,
  }),
};

jest.mock('@/contexts/TeamPlayerContext', () => ({
  useTeamPlayer: () => mockTeamPlayerContextValue,
}));

jest.mock('@/services/activityAssignments', () => ({
  activityAssignmentsService: {
    fetchAssignments: jest.fn(),
    fetchAssignmentState: (...args: any[]) => mockFetchActivityAssignmentState(...args),
    assignActivity: (...args: any[]) => mockAssignActivity(...args),
  },
}));

jest.mock('@/components/IconSymbol', () => ({
  IconSymbol: ({ ios_icon_name, android_material_icon_name }: any) => {
    const React = jest.requireActual('react');
    const { Text } = jest.requireActual('react-native');
    return <Text>{ios_icon_name ?? android_material_icon_name ?? 'icon'}</Text>;
  },
}));

describe('AssignActivityModal selection sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchActivityAssignmentState.mockResolvedValue({
      playerIds: [],
      teamIds: [],
      directPlayerIds: [],
      teamScopeByPlayerId: {},
      excludedPlayerIdsByTeamId: {},
    });
    mockAssignActivity.mockResolvedValue({
      createdCount: 1,
      removedCount: 0,
      updatedCount: 0,
      skippedPlayerIds: [],
      skippedTeamIds: [],
      assignment: { playerIds: ['player-1', 'player-2'], teamIds: ['team-1'] },
    });
    mockGetTeamMembers.mockResolvedValue(mockPlayers);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const renderModal = () =>
    render(
      <AssignActivityModal
        visible
        activity={{
          id: 'activity-1',
          title: 'Session',
          isExternal: false,
          externalEventRowId: null,
          categoryId: 'cat-1',
          intensity: null,
          intensityEnabled: false,
          intensityNote: null,
        }}
        trainerId="trainer-1"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );

  it('keeps the team selected when a team member is toggled off and on from the player tab', async () => {
    const { getByTestId, queryByTestId } = renderModal();

    await waitFor(() => expect(getByTestId('activity.assign.list.players')).toBeTruthy());

    fireEvent.press(getByTestId('activity.assign.tab.teams'));
    await waitFor(() => expect(getByTestId('activity.assign.list.teams')).toBeTruthy());

    fireEvent.press(getByTestId('activity.assign.row.team.team-1'));
    await waitFor(() =>
      expect(queryByTestId('activity.assign.row.selected.team.team-1')).toBeTruthy(),
    );

    fireEvent.press(getByTestId('activity.assign.tab.players'));
    await waitFor(() =>
      expect(queryByTestId('activity.assign.row.selected.player.player-1')).toBeTruthy(),
    );

    fireEvent.press(getByTestId('activity.assign.row.player.player-1'));
    await waitFor(() =>
      expect(queryByTestId('activity.assign.row.selected.player.player-1')).toBeNull(),
    );

    fireEvent.press(getByTestId('activity.assign.row.player.player-1'));
    await waitFor(() =>
      expect(queryByTestId('activity.assign.row.selected.player.player-1')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(getByTestId('activity.assign.saveButton'));
    });

    await waitFor(() =>
      expect(mockAssignActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          activityId: 'activity-1',
          playerIds: [],
          teamIds: ['team-1'],
          excludedPlayerIdsByTeamId: {},
        }),
      ),
    );
  });

  it('keeps the team selected when a team member is toggled off and on from the team member row', async () => {
    const { getByTestId, queryByTestId } = renderModal();

    await waitFor(() => expect(getByTestId('activity.assign.list.players')).toBeTruthy());

    fireEvent.press(getByTestId('activity.assign.tab.teams'));
    await waitFor(() => expect(getByTestId('activity.assign.list.teams')).toBeTruthy());

    fireEvent.press(getByTestId('activity.assign.row.team.team-1'));
    await waitFor(() =>
      expect(queryByTestId('activity.assign.team.member.selected.team-1.player-1')).toBeTruthy(),
    );

    fireEvent.press(getByTestId('activity.assign.team.member.team-1.player-1'));
    await waitFor(() =>
      expect(queryByTestId('activity.assign.team.member.selected.team-1.player-1')).toBeNull(),
    );

    fireEvent.press(getByTestId('activity.assign.team.member.team-1.player-1'));
    await waitFor(() =>
      expect(queryByTestId('activity.assign.team.member.selected.team-1.player-1')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(getByTestId('activity.assign.saveButton'));
    });

    await waitFor(() =>
      expect(mockAssignActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          activityId: 'activity-1',
          playerIds: [],
          teamIds: ['team-1'],
          excludedPlayerIdsByTeamId: {},
        }),
      ),
    );
  });

  it('persists a player exclusion while keeping the team selected', async () => {
    const { getByTestId, queryByTestId } = renderModal();

    await waitFor(() => expect(getByTestId('activity.assign.list.players')).toBeTruthy());

    fireEvent.press(getByTestId('activity.assign.tab.teams'));
    await waitFor(() => expect(getByTestId('activity.assign.list.teams')).toBeTruthy());

    fireEvent.press(getByTestId('activity.assign.row.team.team-1'));
    await waitFor(() =>
      expect(queryByTestId('activity.assign.team.member.selected.team-1.player-1')).toBeTruthy(),
    );

    fireEvent.press(getByTestId('activity.assign.team.member.team-1.player-1'));
    await waitFor(() =>
      expect(queryByTestId('activity.assign.team.member.selected.team-1.player-1')).toBeNull(),
    );

    await act(async () => {
      fireEvent.press(getByTestId('activity.assign.saveButton'));
    });

    await waitFor(() =>
      expect(mockAssignActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          activityId: 'activity-1',
          playerIds: [],
          teamIds: ['team-1'],
          excludedPlayerIdsByTeamId: {
            'team-1': ['player-1'],
          },
        }),
      ),
    );
  });
});
