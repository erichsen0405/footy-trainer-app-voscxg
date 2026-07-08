// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { escapeHtml, getEnv, optionalEnv, resolveAuthUserInviteState, sendWithAwsSes, type AuthLinkType, type InviteEmailContent } from './clubInviteDelivery.ts';
// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { AppError } from './http.ts';

type RpcError = {
  message?: string;
};

type RpcClient = {
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: RpcError | null }>;
};

type GenerateLinkSuccess = {
  properties: {
    action_link?: string;
    redirect_to?: string;
    verification_type?: string;
  } | null;
};

type GuardianInviteDeliveryClient = RpcClient & {
  auth: {
    admin: {
      generateLink: (params: {
        type: AuthLinkType;
        email: string;
        options?: {
          redirectTo?: string;
        };
      }) => Promise<{ data: GenerateLinkSuccess | null; error: RpcError | null }>;
    };
  };
};

export type GuardianInviteForEmail = {
  id: string;
  ownerName: string;
  playerName: string;
  email: string;
  fullName: string;
  relation: 'parent' | 'guardian' | 'other';
  token: string;
};

export type GuardianInviteEmailConfig = {
  appName: string;
  authRedirectUrl: string;
  fromEmail: string;
  fromName: string;
  landingUrl: string;
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken: string | null;
};

export type GuardianInviteEmailDeliveryResult = {
  status: 'sent' | 'skipped' | 'failed';
  authLinkType: AuthLinkType | null;
  ownerName: string | null;
  playerName: string | null;
  landingUrl: string | null;
  provider: 'aws_ses' | 'none';
  warning: string | null;
};

type GuardianInviteEmailConfigResolution = {
  config: GuardianInviteEmailConfig | null;
  missing: string[];
};

type GuardianInviteDeliveryContext = {
  actionLink: string;
  authLinkType: AuthLinkType;
  landingUrl: string;
};

function envWithFallback(primary: string, fallback?: string): string | null {
  return getEnv(primary) ?? (fallback ? getEnv(fallback) : null);
}

export function getGuardianInviteEmailConfigFromEnv(): GuardianInviteEmailConfigResolution {
  const guardianAuthRedirectUrl = getEnv('GUARDIAN_INVITE_AUTH_REDIRECT_URL');
  const guardianLandingUrl = getEnv('GUARDIAN_INVITE_LANDING_URL') ?? guardianAuthRedirectUrl;
  const requiredEnv = {
    authRedirectUrl: guardianAuthRedirectUrl,
    fromEmail: envWithFallback('GUARDIAN_INVITE_FROM_EMAIL', 'CLUB_INVITE_FROM_EMAIL'),
    landingUrl: guardianLandingUrl,
    awsRegion: getEnv('AWS_SES_REGION'),
    awsAccessKeyId: getEnv('AWS_SES_ACCESS_KEY_ID'),
    awsSecretAccessKey: getEnv('AWS_SES_SECRET_ACCESS_KEY'),
  } as const;

  const missing = Object.entries(requiredEnv)
    .filter(([, value]) => !value)
    .map(([key]) => {
      switch (key) {
        case 'authRedirectUrl':
          return 'GUARDIAN_INVITE_AUTH_REDIRECT_URL';
        case 'fromEmail':
          return 'GUARDIAN_INVITE_FROM_EMAIL or CLUB_INVITE_FROM_EMAIL';
        case 'landingUrl':
          return 'GUARDIAN_INVITE_LANDING_URL or GUARDIAN_INVITE_AUTH_REDIRECT_URL';
        case 'awsRegion':
          return 'AWS_SES_REGION';
        case 'awsAccessKeyId':
          return 'AWS_SES_ACCESS_KEY_ID';
        case 'awsSecretAccessKey':
          return 'AWS_SES_SECRET_ACCESS_KEY';
        default:
          return key;
      }
    });

  if (missing.length > 0) {
    return {
      config: null,
      missing,
    };
  }

  return {
    config: {
      appName: optionalEnv('GUARDIAN_INVITE_APP_NAME', optionalEnv('CLUB_INVITE_APP_NAME', 'Footy Trainer')),
      authRedirectUrl: requiredEnv.authRedirectUrl!,
      fromEmail: requiredEnv.fromEmail!,
      fromName: optionalEnv('GUARDIAN_INVITE_FROM_NAME', optionalEnv('CLUB_INVITE_FROM_NAME', 'Footy Trainer')),
      landingUrl: requiredEnv.landingUrl!,
      awsRegion: requiredEnv.awsRegion!,
      awsAccessKeyId: requiredEnv.awsAccessKeyId!,
      awsSecretAccessKey: requiredEnv.awsSecretAccessKey!,
      awsSessionToken: getEnv('AWS_SES_SESSION_TOKEN'),
    },
    missing: [],
  };
}

export function buildGuardianInviteLandingUrl(
  baseUrl: string,
  invite: Pick<GuardianInviteForEmail, 'token'>
): string {
  const url = new URL(baseUrl);
  url.searchParams.set('guardianInviteToken', invite.token);
  return url.toString();
}

export function buildGuardianInviteAuthRedirectUrl(
  baseUrl: string,
  invite: Pick<GuardianInviteForEmail, 'token'>,
  authLinkType?: AuthLinkType
): string {
  const url = new URL(baseUrl);
  url.searchParams.set('guardianInviteToken', invite.token);
  if (authLinkType) {
    url.searchParams.set('guardianInviteAuthType', authLinkType);
  }
  return url.toString();
}

async function resolveGuardianInviteDeliveryContext(
  client: GuardianInviteDeliveryClient,
  invite: GuardianInviteForEmail,
  config: GuardianInviteEmailConfig
): Promise<GuardianInviteDeliveryContext> {
  const authUserState = await resolveAuthUserInviteState(client, invite.email);
  const isConfirmedUser = Boolean(authUserState?.emailConfirmedAt ?? authUserState?.confirmedAt);

  const authLinkType: AuthLinkType = isConfirmedUser ? 'magiclink' : 'invite';
  const redirectTo = buildGuardianInviteAuthRedirectUrl(config.authRedirectUrl, invite, authLinkType);
  const { data, error } = await client.auth.admin.generateLink({
    type: authLinkType,
    email: invite.email,
    options: {
      redirectTo,
    },
  });

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message ?? 'Could not generate guardian invite auth link.', 500);
  }

  const actionLink = data?.properties?.action_link?.trim();
  if (!actionLink) {
    throw new AppError('INTERNAL_ERROR', 'Could not generate guardian invite auth link.', 500);
  }

  return {
    actionLink,
    authLinkType,
    landingUrl: buildGuardianInviteLandingUrl(config.landingUrl, invite),
  };
}

export function buildGuardianInviteEmailContent(
  invite: GuardianInviteForEmail,
  context: GuardianInviteDeliveryContext,
  config: Pick<GuardianInviteEmailConfig, 'appName'>
): InviteEmailContent {
  const relationLabel = invite.relation === 'parent' ? 'parent' : 'guardian';
  const subject = `${invite.ownerName}: guardian access for ${invite.playerName}`;
  const primaryActionLabel =
    context.authLinkType === 'invite'
      ? 'Create account and accept access'
      : 'Log in and accept access';
  const safeOwnerName = escapeHtml(invite.ownerName);
  const safePlayerName = escapeHtml(invite.playerName);
  const safeFullName = escapeHtml(invite.fullName);
  const safeRelation = escapeHtml(relationLabel);
  const safeEmail = escapeHtml(invite.email);
  const safeAppName = escapeHtml(config.appName);
  const safeActionLink = escapeHtml(context.actionLink);
  const safeLandingUrl = escapeHtml(context.landingUrl);

  return {
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <p>Hello ${safeFullName},</p>
        <p>You have been added as a <strong>${safeRelation}</strong> for <strong>${safePlayerName}</strong> in <strong>${safeOwnerName}</strong> on ${safeAppName}.</p>
        <p>After accepting, you can follow the player information and training context the coach makes available to guardians.</p>
        <p>This invitation was sent to <strong>${safeEmail}</strong>.</p>
        <p style="margin: 24px 0;">
          <a
            href="${safeActionLink}"
            style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px;"
          >
            ${escapeHtml(primaryActionLabel)}
          </a>
        </p>
        <p>If the button does not work, open the invitation directly here:</p>
        <p><a href="${safeLandingUrl}">${safeLandingUrl}</a></p>
      </div>
    `.trim(),
    text: [
      `Hello ${invite.fullName},`,
      '',
      `You have been added as a ${relationLabel} for ${invite.playerName} in ${invite.ownerName} on ${config.appName}.`,
      'After accepting, you can follow the player information and training context the coach makes available to guardians.',
      `This invitation was sent to ${invite.email}.`,
      '',
      `${primaryActionLabel}: ${context.actionLink}`,
      '',
      `Fallback invite link: ${context.landingUrl}`,
    ].join('\n'),
  };
}

export async function deliverGuardianInviteEmail(
  client: GuardianInviteDeliveryClient,
  invite: GuardianInviteForEmail,
  options?: {
    config?: GuardianInviteEmailConfig;
  }
): Promise<GuardianInviteEmailDeliveryResult> {
  const configResolution = options?.config
    ? { config: options.config, missing: [] }
    : getGuardianInviteEmailConfigFromEnv();
  const config = configResolution.config;

  if (!config) {
    const warning = `Guardian invite email skipped: missing ${configResolution.missing.join(', ')}.`;
    console.warn('[guardian-invite-delivery] skipped', {
      inviteId: invite.id,
      missing: configResolution.missing,
    });
    return {
      status: 'skipped',
      authLinkType: null,
      ownerName: invite.ownerName,
      playerName: invite.playerName,
      landingUrl: null,
      provider: 'none',
      warning,
    };
  }

  let context: GuardianInviteDeliveryContext;
  try {
    context = await resolveGuardianInviteDeliveryContext(client, invite, config);
  } catch (error) {
    const warning =
      error instanceof AppError
        ? `Guardian invite auth-link generation failed: ${error.message}`
        : 'Guardian invite auth-link generation failed.';
    console.error('[guardian-invite-delivery] auth-link failed', {
      inviteId: invite.id,
      error,
    });
    return {
      status: 'failed',
      authLinkType: null,
      ownerName: invite.ownerName,
      playerName: invite.playerName,
      landingUrl: buildGuardianInviteLandingUrl(config.landingUrl, invite),
      provider: 'aws_ses',
      warning,
    };
  }

  const content = buildGuardianInviteEmailContent(invite, context, config);
  try {
    await sendWithAwsSes(content, invite, config);
  } catch (error) {
    const warning =
      error instanceof AppError
        ? `Guardian invite email send failed: ${error.message}`
        : 'Guardian invite email send failed.';
    console.error('[guardian-invite-delivery] send failed', {
      inviteId: invite.id,
      error,
    });
    return {
      status: 'failed',
      authLinkType: context.authLinkType,
      ownerName: invite.ownerName,
      playerName: invite.playerName,
      landingUrl: context.landingUrl,
      provider: 'aws_ses',
      warning,
    };
  }

  return {
    status: 'sent',
    authLinkType: context.authLinkType,
    ownerName: invite.ownerName,
    playerName: invite.playerName,
    landingUrl: context.landingUrl,
    provider: 'aws_ses',
    warning: null,
  };
}
