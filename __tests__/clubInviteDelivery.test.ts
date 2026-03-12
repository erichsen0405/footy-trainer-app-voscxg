import {
  buildClubInviteAuthRedirectUrl,
  buildClubInviteEmailContent,
  buildClubInviteLandingUrl,
  deliverClubInviteEmail,
  resolveClubInviteDeliveryContext,
  type ClubInviteEmailConfig,
} from '../supabase/functions/_shared/clubInviteDelivery';

const clubId = '11111111-1111-4111-8111-111111111111';
const inviteId = '22222222-2222-4222-8222-222222222222';
const invitedBy = '33333333-3333-4333-8333-333333333333';

const invite = {
  id: inviteId,
  clubId,
  email: 'coach@example.com',
  role: 'coach' as const,
  token: 'secure-token',
  status: 'pending',
  expiresAt: '2026-03-20T12:00:00.000Z',
  invitedBy,
  createdAt: '2026-03-10T12:00:00.000Z',
  updatedAt: '2026-03-10T12:00:00.000Z',
  acceptedAt: null,
  cancelledAt: null,
};

const config: ClubInviteEmailConfig = {
  appName: 'Footy Trainer',
  authRedirectUrl: 'https://admin.example.com/auth/callback',
  fromEmail: 'invites@example.com',
  fromName: 'Footy Trainer',
  landingUrl: 'https://admin.example.com/invite',
  awsRegion: 'eu-west-1',
  awsAccessKeyId: 'AKIATESTKEY',
  awsSecretAccessKey: 'secret-test-key',
  awsSessionToken: null,
};

function createClient(authUserId: string | null) {
  return {
    rpc: jest.fn().mockImplementation((fn: string) => {
      if (fn === 'get_auth_user_id_by_email') {
        return Promise.resolve({ data: authUserId, error: null });
      }

      if (fn === 'get_club_payload') {
        return Promise.resolve({
          data: {
            id: clubId,
            name: 'FC Copenhagen',
            status: 'active',
            createdAt: '2026-03-10T12:00:00.000Z',
          },
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
              redirect_to: 'https://admin.example.com/auth/callback?clubInviteToken=secure-token',
              verification_type: authUserId ? 'magiclink' : 'invite',
            },
          },
          error: null,
        }),
      },
    },
  };
}

describe('club invite delivery helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds landing and auth redirect URLs with the invite token', () => {
    expect(buildClubInviteLandingUrl(config.landingUrl, invite)).toBe(
      'https://admin.example.com/invite?token=secure-token'
    );
    expect(buildClubInviteAuthRedirectUrl(config.authRedirectUrl, invite)).toBe(
      'https://admin.example.com/auth/callback?clubInviteToken=secure-token'
    );
  });

  it('uses invite auth links for new users', async () => {
    const client = createClient(null);

      await expect(resolveClubInviteDeliveryContext(client, invite, config)).resolves.toMatchObject({
      authLinkType: 'invite',
      clubName: 'FC Copenhagen',
      landingUrl: 'https://admin.example.com/invite?token=secure-token',
    });

    expect(client.auth.admin.generateLink).toHaveBeenCalledWith({
      type: 'invite',
      email: 'coach@example.com',
      options: {
        redirectTo: 'https://admin.example.com/auth/callback?clubInviteToken=secure-token&clubInviteAuthType=invite',
      },
    });
  });

  it('uses magic links for existing users', async () => {
    const client = createClient('44444444-4444-4444-8444-444444444444');

    await expect(resolveClubInviteDeliveryContext(client, invite, config)).resolves.toMatchObject({
      authLinkType: 'magiclink',
      clubName: 'FC Copenhagen',
    });

    expect(client.auth.admin.generateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'coach@example.com',
      options: {
        redirectTo: 'https://admin.example.com/auth/callback?clubInviteToken=secure-token&clubInviteAuthType=magiclink',
      },
    });
  });

  it('renders invite-aware email copy for new users', () => {
    const content = buildClubInviteEmailContent(
      invite,
      {
        actionLink: 'https://auth.example.com/action-link',
        authLinkType: 'invite',
        clubName: 'FC Copenhagen',
        landingUrl: 'https://admin.example.com/invite?token=secure-token',
      },
      config
    );

    expect(content.subject).toBe('FC Copenhagen: invitation som træner');
    expect(content.html).toContain('som <strong>træner</strong>');
    expect(content.html).toContain('Opret konto og vælg adgangskode');
    expect(content.text).toContain('Du er inviteret til FC Copenhagen som træner i Footy Trainer.');
    expect(content.text).toContain('Fallback invite-link: https://admin.example.com/invite?token=secure-token');
  });

  it('sends aws ses payloads with the generated auth link', async () => {
    const client = createClient(null);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
    } as Response);

    await expect(
      deliverClubInviteEmail(client, invite, {
        config,
      })
    ).resolves.toEqual({
      status: 'sent',
      authLinkType: 'invite',
      clubName: 'FC Copenhagen',
      landingUrl: 'https://admin.example.com/invite?token=secure-token',
      provider: 'aws_ses',
      warning: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('AWS4-HMAC-SHA256 Credential=AKIATESTKEY/'),
          'Content-Type': 'application/json',
          Host: 'email.eu-west-1.amazonaws.com',
          'X-Amz-Content-Sha256': expect.any(String),
          'X-Amz-Date': expect.any(String),
        }),
      })
    );
  });

  it('skips delivery when required env is missing', async () => {
    const client = createClient(null);

    await expect(deliverClubInviteEmail(client, invite)).resolves.toEqual({
      status: 'skipped',
      authLinkType: null,
      clubName: null,
      landingUrl: null,
      provider: 'none',
      warning:
        'Invite email skipped: missing CLUB_INVITE_AUTH_REDIRECT_URL, CLUB_INVITE_FROM_EMAIL, CLUB_INVITE_LANDING_URL, AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY.',
    });

    expect(client.auth.admin.generateLink).not.toHaveBeenCalled();
  });
});
