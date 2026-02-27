import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import CreateExerciseScreen from '../app/create-exercise';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockGetUser = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockMaybeSingle = jest.fn();
const mockSingle = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => ({ isLoading: false, userRole: 'trainer', isTrainer: true, isAdmin: false }),
}));

jest.mock('@/hooks/useSubscriptionFeatures', () => ({
  useSubscriptionFeatures: () => ({ subscriptionTier: 'trainer_basic' }),
}));

jest.mock('@/components/IconSymbol', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    IconSymbol: ({ ios_icon_name, android_material_icon_name }: { ios_icon_name?: string; android_material_icon_name?: string }) => (
      <Text>{ios_icon_name ?? android_material_icon_name ?? 'icon'}</Text>
    ),
  };
});

jest.mock('@/integrations/supabase/client', () => {
  const from = () => {
    let mode: 'idle' | 'select' | 'insert' | 'update' = 'idle';
    let updateEqCount = 0;

    const builder: any = {
      select: () => {
        if (mode === 'insert') return builder;
        mode = 'select';
        return builder;
      },
      eq: () => {
        if (mode === 'update') {
          updateEqCount += 1;
          if (updateEqCount >= 2) {
            return Promise.resolve({ error: null });
          }
        }
        return builder;
      },
      maybeSingle: () => mockMaybeSingle(),
      insert: (payload: any) => {
        mode = 'insert';
        mockInsert(payload);
        return builder;
      },
      update: (payload: any) => {
        mode = 'update';
        updateEqCount = 0;
        mockUpdate(payload);
        return builder;
      },
      single: () => mockSingle(),
    };

    return builder;
  };

  return {
    supabase: {
      auth: {
        getUser: () => mockGetUser(),
      },
      from,
    },
  };
});

describe('create-exercise position dropdown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({});
    mockGetUser.mockResolvedValue({ data: { user: { id: 'trainer-1' } }, error: null });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockSingle.mockResolvedValue({ data: { id: 'new-ex-1' }, error: null });
  });

  it('opens dropdown, selects position, and sends position in create payload', async () => {
    const { findByTestId, getByPlaceholderText, getByText } = render(<CreateExerciseScreen />);

    fireEvent.press(await findByTestId('exercise-position-select'));
    fireEvent.press(await findByTestId('exercise-position-option-back'));

    fireEvent.changeText(getByPlaceholderText('Eks. Aflevering på førsteberøring'), 'Ny øvelse');
    fireEvent.press(getByText('Gem'));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Ny øvelse',
          position: 'Back',
        })
      );
    });
  });

  it('prefills existing position in edit mode', async () => {
    mockUseLocalSearchParams.mockReturnValue({ exerciseId: 'ex-123', mode: 'edit' });
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'ex-123',
        trainer_id: 'trainer-1',
        is_system: false,
        title: 'Eksisterende øvelse',
        description: null,
        video_url: null,
        category_path: null,
        difficulty: 3,
        position: 'Kant',
      },
      error: null,
    });

    const { findByText } = render(<CreateExerciseScreen />);
    expect(await findByText('Kant')).toBeTruthy();
  });
});
