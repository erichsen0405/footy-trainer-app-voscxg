import {
  buildGuardianInviteAuthRedirectUrl,
  buildGuardianInviteLandingUrl,
  deliverGuardianInviteEmail,
  getGuardianInviteEmailConfigFromEnv,
  type GuardianInviteEmailConfig,
  type GuardianInviteForEmail,
} from '../supabase/functions/_shared/guardianInviteDelivery';

const invite: GuardianInviteForEmail = {
  id: '22222222-2222-4222-8222-222222222222',
  ownerName: 'Coach Business',
  playerName: 'Player Name',
  email: 'parent@example.com',
  fullName: 'Parent Name',
  relation: 'parent',
  token: 'guardian-secure-token',
};

const config: GuardianInviteEmailConfig = {
  appName: 'Footy Trainer',
  authRedirectUrl: 'https://footballcoach.online/AuthCallback',
  fromEmail: 'invites@example.com',
  fromName: 'Footy Trainer',
  landingUrl: 'https://footballcoach.online/AuthCallback',
  awsRegion: 'eu-west-1',
  awsAccessKeyId: 'AKIATESTKEY',
  awsSecretAccessKey: 'secret-test-key',
  awsSessionToken: null,
};

function createClient(authUserId: string | null) {
  return {
    rpc: jest.fn().mockImplementation((fn: string) => {
      if (fn === 'get_auth_user_invite_state_by_email') {
        return Promise.resolve({
          data: authUserId
            ? {
                id: authUserId,
                emailConfirmedAt: '2026-03-10T12:00:00.000Z',
                confirmedAt: '2026-03-10T12:00:00.000Z',
                invitedAt: null,
              }
            : null,
          error: null,
        });
      }

      return Promise.resolve({ data: null, error: { message: `Unexpected RPC ${fn}` } });
    }),
    auth: {
      admin: {
        generateLink: jest.fn().mockResolvedValue({
          data: {
            properties: {
              action_link: 'https://auth.example.com/action-link',
              redirect_to:
                'https://footballcoach.online/AuthCallback?guardianInviteToken=guardian-secure-token',
              verification_type: authUserId ? 'magiclink' : 'invite',
            },
          },
          error: null,
        }),
      },
    },
  };
}

describe('guardian invite delivery helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('builds guardian-specific landing and auth redirect URLs', () => {
    expect(buildGuardianInviteLandingUrl(config.landingUrl, invite)).toBe(
      'https://footballcoach.online/AuthCallback?guardianInviteToken=guardian-secure-token'
    );
    expect(buildGuardianInviteAuthRedirectUrl(config.authRedirectUrl, invite, 'magiclink')).toBe(
      'https://footballcoach.online/AuthCallback?guardianInviteToken=guardian-secure-token&guardianInviteAuthType=magiclink'
    );
  });

  it('does not fall back to club invite URLs for guardian auth or landing', () => {
    process.env.CLUB_INVITE_AUTH_REDIRECT_URL = 'https://footballcoach.online/AuthCallback';
    process.env.CLUB_INVITE_LANDING_URL = 'https://footballcoach.online/invite';
    process.env.CLUB_INVITE_FROM_EMAIL = 'invites@example.com';
    process.env.AWS_SES_REGION = 'eu-west-1';
    process.env.AWS_SES_ACCESS_KEY_ID = 'AKIATESTKEY';
    process.env.AWS_SES_SECRET_ACCESS_KEY = 'secret-test-key';
    delete process.env.GUARDIAN_INVITE_AUTH_REDIRECT_URL;
    delete process.env.GUARDIAN_INVITE_LANDING_URL;

    expect(getGuardianInviteEmailConfigFromEnv()).toEqual({
      config: null,
      missing: [
        'GUARDIAN_INVITE_AUTH_REDIRECT_URL',
        'GUARDIAN_INVITE_LANDING_URL or GUARDIAN_INVITE_AUTH_REDIRECT_URL',
      ],
    });
  });

  it('uses magic links for existing guardian users with guardian token params', async () => {
    const client = createClient('44444444-4444-4444-8444-444444444444');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
    } as Response);

    await expect(
      deliverGuardianInviteEmail(client, invite, {
        config,
      })
    ).resolves.toEqual({
      status: 'sent',
      authLinkType: 'magiclink',
      ownerName: 'Coach Business',
      playerName: 'Player Name',
      landingUrl: 'https://footballcoach.online/AuthCallback?guardianInviteToken=guardian-secure-token',
      provider: 'aws_ses',
      warning: null,
    });

    expect(client.auth.admin.generateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'parent@example.com',
      options: {
        redirectTo:
          'https://footballcoach.online/AuthCallback?guardianInviteToken=guardian-secure-token&guardianInviteAuthType=magiclink',
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
