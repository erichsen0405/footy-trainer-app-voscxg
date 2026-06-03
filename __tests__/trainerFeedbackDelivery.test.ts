import {
  buildTrainerFeedbackAppUrl,
  buildTrainerFeedbackEmailContent,
  buildTrainerFeedbackPath,
  buildTrainerFeedbackPushPayload,
  deliverTrainerFeedbackEmail,
  deliverTrainerFeedbackPush,
  type TrainerFeedbackEmailConfig,
} from '../supabase/functions/_shared/trainerFeedbackDelivery';

const config: TrainerFeedbackEmailConfig = {
  appName: 'Footy Trainer',
  appScheme: 'footballcoach',
  fromEmail: 'feedback@example.com',
  fromName: 'Footy Trainer',
  awsRegion: 'eu-west-1',
  awsAccessKeyId: 'AKIATESTKEY',
  awsSecretAccessKey: 'secret-test-key',
  awsSessionToken: null,
};

function createPushClient(tokens: (string | null)[]) {
  return {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({
          data: tokens.map((expo_push_token) => ({ expo_push_token })),
          error: null,
        }),
      })),
    })),
  };
}

describe('trainer feedback delivery helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds activity deeplinks for trainer feedback', () => {
    expect(buildTrainerFeedbackPath('activity-1')).toBe('/activity-details?id=activity-1&activityId=activity-1');
    expect(buildTrainerFeedbackAppUrl('activity-1')).toBe(
      'footballcoach:///activity-details?id=activity-1&activityId=activity-1',
    );
  });

  it('builds push payloads that deep-link to the activity', () => {
    expect(
      buildTrainerFeedbackPushPayload({
        activityId: 'activity-1',
        activityTitle: 'Mandagstræning',
        trainerName: 'Coach Kim',
        feedbackText: 'Hold fokus på orienteringen.',
      }),
    ).toEqual({
      title: 'Ny feedback fra træner',
      body: 'Coach Kim har sendt feedback på Mandagstræning.',
      data: {
        type: 'trainer-feedback',
        activityId: 'activity-1',
        url: '/activity-details?id=activity-1&activityId=activity-1',
        feedbackPreview: 'Hold fokus på orienteringen.',
      },
    });
  });

  it('renders trainer feedback email copy with the feedback text and activity link', () => {
    const content = buildTrainerFeedbackEmailContent(
      {
        activityId: 'activity-1',
        activityTitle: 'Mandagstræning',
        trainerName: 'Coach Kim',
        feedbackText: 'Vær tidligere i din orientering.',
      },
      config,
    );

    expect(content.subject).toBe('Ny feedback fra din træner');
    expect(content.html).toContain('Coach Kim');
    expect(content.html).toContain('Vær tidligere i din orientering.');
    expect(content.html).toContain('footballcoach:///activity-details?id=activity-1&amp;activityId=activity-1');
    expect(content.text).toContain('Aktivitet: Mandagstræning');
  });

  it('skips trainer feedback emails when config is missing', async () => {
    await expect(
      deliverTrainerFeedbackEmail('player@example.com', {
        activityId: 'activity-1',
        activityTitle: 'Mandagstræning',
        trainerName: 'Coach Kim',
        feedbackText: 'Vær tidligere i din orientering.',
      }),
    ).resolves.toEqual({
      status: 'skipped',
      provider: 'none',
      warning:
        'Trainer feedback email skipped: missing TRAINER_FEEDBACK_FROM_EMAIL/CLUB_INVITE_FROM_EMAIL, AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY.',
    });
  });

  it('sends trainer feedback emails through AWS SES when config is provided', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
    } as Response);

    await expect(
      deliverTrainerFeedbackEmail(
        'player@example.com',
        {
          activityId: 'activity-1',
          activityTitle: 'Mandagstræning',
          trainerName: 'Coach Kim',
          feedbackText: 'Vær tidligere i din orientering.',
        },
        { config },
      ),
    ).resolves.toEqual({
      status: 'sent',
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
        }),
      }),
    );
  });

  it('skips push delivery when the player has no tokens', async () => {
    await expect(
      deliverTrainerFeedbackPush(
        createPushClient([]) as any,
        'player-1',
        buildTrainerFeedbackPushPayload({
          activityId: 'activity-1',
          activityTitle: 'Mandagstræning',
          trainerName: 'Coach Kim',
          feedbackText: 'Hold fokus på orienteringen.',
        }),
      ),
    ).resolves.toEqual({
      status: 'skipped',
      tokenCount: 0,
      warning: 'No push tokens for player.',
    });
  });

  it('sends push delivery through Expo when the player has tokens', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
    } as Response);

    await expect(
      deliverTrainerFeedbackPush(
        createPushClient(['ExponentPushToken[test-token]']) as any,
        'player-1',
        buildTrainerFeedbackPushPayload({
          activityId: 'activity-1',
          activityTitle: 'Mandagstræning',
          trainerName: 'Coach Kim',
          feedbackText: 'Hold fokus på orienteringen.',
        }),
      ),
    ).resolves.toEqual({
      status: 'sent',
      tokenCount: 1,
      warning: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }),
    );
  });
});
