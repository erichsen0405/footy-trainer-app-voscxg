const mockTrackStartupTelemetry = jest.fn().mockResolvedValue(undefined);

const mockAuthStateChangeCallbacks: ((event: string, session: any) => void)[] = [];
const mockOriginalGetSession = jest.fn();
const mockOriginalGetUser = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue({ error: null });

jest.mock('@/utils/startupTelemetry', () => ({
  trackStartupTelemetry: (...args: any[]) => mockTrackStartupTelemetry(...args),
}));

jest.mock('@supabase/supabase-js', () => {
  const mockClient = {
    auth: {
      getSession: (...args: any[]) => mockOriginalGetSession(...args),
      getUser: (...args: any[]) => mockOriginalGetUser(...args),
      signOut: (...args: any[]) => mockSignOut(...args),
      onAuthStateChange: (callback: (event: string, session: any) => void) => {
        mockAuthStateChangeCallbacks.push(callback);
        return {
          data: {
            subscription: {
              unsubscribe: jest.fn(),
            },
          },
        };
      },
    },
  };

  return {
    createClient: jest.fn(() => mockClient),
  };
});

describe('supabase auth client hardening', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    mockAuthStateChangeCallbacks.length = 0;
    mockOriginalGetSession.mockReset();
    mockOriginalGetUser.mockReset();
    mockSignOut.mockClear();
    mockTrackStartupTelemetry.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('falls back to the latest known session when getSession times out', async () => {
    mockOriginalGetSession.mockImplementation(() => new Promise(() => {}));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require('@/integrations/supabase/client');

    expect(mockAuthStateChangeCallbacks).toHaveLength(1);
    mockAuthStateChangeCallbacks[0]('TOKEN_REFRESHED', {
      user: { id: 'user-1' },
      access_token: 'token',
    });

    const sessionPromise = supabase.auth.getSession();
    await jest.advanceTimersByTimeAsync(4000);

    await expect(sessionPromise).resolves.toMatchObject({
      data: {
        session: expect.objectContaining({
          user: expect.objectContaining({ id: 'user-1' }),
        }),
      },
      error: null,
    });
  });
});
