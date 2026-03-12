// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { AppError } from './http.ts';
// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import type { ClubInvite } from './clubAdmin.ts';

type RpcError = {
  message?: string;
};

type RpcClient = {
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: RpcError | null }>;
};

type AuthLinkType = 'invite' | 'magiclink';

type GenerateLinkSuccess = {
  properties: {
    action_link?: string;
    redirect_to?: string;
    verification_type?: string;
  } | null;
};

type ClubInviteDeliveryClient = RpcClient & {
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

export type ClubInviteEmailConfig = {
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

type ClubInviteDeliveryContext = {
  actionLink: string;
  authLinkType: AuthLinkType;
  clubName: string;
  landingUrl: string;
};

type ClubInviteEmailContent = {
  subject: string;
  html: string;
  text: string;
};

export type ClubInviteEmailDeliveryResult = {
  status: 'sent' | 'skipped' | 'failed';
  authLinkType: AuthLinkType | null;
  clubName: string | null;
  landingUrl: string | null;
  provider: 'aws_ses' | 'none';
  warning: string | null;
};

function getInviteRoleLabel(role: ClubInvite['role']): string {
  switch (role) {
    case 'coach':
      return 'træner';
    case 'player':
      return 'spiller';
    case 'admin':
      return 'admin';
    default:
      return role;
  }
}

function getEnv(name: string): string | null {
  const deno = (globalThis as { Deno?: { env?: { get: (key: string) => string | undefined } } }).Deno;
  if (deno?.env) {
    return deno.env.get(name)?.trim() ?? null;
  }

  const nodeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  if (nodeProcess?.env) {
    return nodeProcess.env[name]?.trim() ?? null;
  }

  return null;
}

function optionalEnv(name: string, fallback: string): string {
  return getEnv(name) ?? fallback;
}

type ClubInviteEmailConfigResolution = {
  config: ClubInviteEmailConfig | null;
  missing: string[];
};

async function callRpc<T>(
  client: RpcClient,
  fn: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { data, error } = await client.rpc<T>(fn, args);
  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message ?? `RPC ${fn} failed.`, 500);
  }

  if (data === null || data === undefined) {
    throw new AppError('INTERNAL_ERROR', `RPC ${fn} returned no data.`, 500);
  }

  return data;
}

async function callNullableRpc<T>(
  client: RpcClient,
  fn: string,
  args?: Record<string, unknown>
): Promise<T | null> {
  const { data, error } = await client.rpc<T>(fn, args);
  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message ?? `RPC ${fn} failed.`, 500);
  }

  return data ?? null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function getClubInviteEmailConfigFromEnv(): ClubInviteEmailConfigResolution {
  const requiredEnv = {
    authRedirectUrl: getEnv('CLUB_INVITE_AUTH_REDIRECT_URL'),
    fromEmail: getEnv('CLUB_INVITE_FROM_EMAIL'),
    landingUrl: getEnv('CLUB_INVITE_LANDING_URL'),
    awsRegion: getEnv('AWS_SES_REGION'),
    awsAccessKeyId: getEnv('AWS_SES_ACCESS_KEY_ID'),
    awsSecretAccessKey: getEnv('AWS_SES_SECRET_ACCESS_KEY'),
  } as const;

  const missing = Object.entries(requiredEnv)
    .filter(([, value]) => !value)
    .map(([key]) => {
      switch (key) {
        case 'authRedirectUrl':
          return 'CLUB_INVITE_AUTH_REDIRECT_URL';
        case 'fromEmail':
          return 'CLUB_INVITE_FROM_EMAIL';
        case 'landingUrl':
          return 'CLUB_INVITE_LANDING_URL';
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
      appName: optionalEnv('CLUB_INVITE_APP_NAME', 'Footy Trainer'),
      authRedirectUrl: requiredEnv.authRedirectUrl!,
      fromEmail: requiredEnv.fromEmail!,
      fromName: optionalEnv('CLUB_INVITE_FROM_NAME', 'Footy Trainer'),
      landingUrl: requiredEnv.landingUrl!,
      awsRegion: requiredEnv.awsRegion!,
      awsAccessKeyId: requiredEnv.awsAccessKeyId!,
      awsSecretAccessKey: requiredEnv.awsSecretAccessKey!,
      awsSessionToken: getEnv('AWS_SES_SESSION_TOKEN'),
    },
    missing: [],
  };
}

export function buildClubInviteLandingUrl(baseUrl: string, invite: Pick<ClubInvite, 'token'>): string {
  const url = new URL(baseUrl);
  url.searchParams.set('token', invite.token);
  return url.toString();
}

export function buildClubInviteAuthRedirectUrl(
  baseUrl: string,
  invite: Pick<ClubInvite, 'token'>,
  authLinkType?: AuthLinkType
): string {
  const url = new URL(baseUrl);
  url.searchParams.set('clubInviteToken', invite.token);
  if (authLinkType) {
    url.searchParams.set('clubInviteAuthType', authLinkType);
  }
  return url.toString();
}

async function resolveClubName(client: RpcClient, clubId: string): Promise<string> {
  const payload = await callRpc<Record<string, unknown>>(client, 'get_club_payload', {
    p_club_id: clubId,
  });

  const clubName = payload.name;
  if (typeof clubName !== 'string' || !clubName.trim()) {
    throw new AppError('INTERNAL_ERROR', 'Could not resolve club name for invite delivery.', 500);
  }

  return clubName.trim();
}

export async function resolveClubInviteDeliveryContext(
  client: ClubInviteDeliveryClient,
  invite: ClubInvite,
  config: ClubInviteEmailConfig,
  clubName?: string
): Promise<ClubInviteDeliveryContext> {
  const existingAuthUserId = await callNullableRpc<string>(client, 'get_auth_user_id_by_email', {
    p_email: invite.email,
  });

  const authLinkType: AuthLinkType = existingAuthUserId ? 'magiclink' : 'invite';
  const redirectTo = buildClubInviteAuthRedirectUrl(config.authRedirectUrl, invite, authLinkType);
  const {
    data,
    error,
  } = await client.auth.admin.generateLink({
    type: authLinkType,
    email: invite.email,
    options: {
      redirectTo,
    },
  });

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message ?? 'Could not generate invite auth link.', 500);
  }

  const actionLink = data?.properties?.action_link?.trim();
  if (!actionLink) {
    throw new AppError('INTERNAL_ERROR', 'Could not generate invite auth link.', 500);
  }

  return {
    actionLink,
    authLinkType,
    clubName: clubName?.trim() || (await resolveClubName(client, invite.clubId)),
    landingUrl: buildClubInviteLandingUrl(config.landingUrl, invite),
  };
}

export function buildClubInviteEmailContent(
  invite: Pick<ClubInvite, 'email' | 'role'>,
  context: ClubInviteDeliveryContext,
  config: Pick<ClubInviteEmailConfig, 'appName'>
): ClubInviteEmailContent {
  const roleLabel = getInviteRoleLabel(invite.role);
  const subject = `${context.clubName}: invitation som ${roleLabel}`;
  const primaryActionLabel =
    context.authLinkType === 'invite'
      ? 'Opret konto og vælg adgangskode'
      : 'Log ind og accepter invitation';
  const safeClubName = escapeHtml(context.clubName);
  const safeRole = escapeHtml(roleLabel);
  const safeEmail = escapeHtml(invite.email);
  const safeAppName = escapeHtml(config.appName);
  const safeActionLink = escapeHtml(context.actionLink);
  const safeLandingUrl = escapeHtml(context.landingUrl);

  return {
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <p>Hej,</p>
        <p>Du er inviteret til klubben <strong>${safeClubName}</strong> som <strong>${safeRole}</strong> i ${safeAppName}.</p>
        <p>Du er blevet inviteret og skal først oprette din konto.</p>
        <p>Denne invitation er sendt til <strong>${safeEmail}</strong>.</p>
        <p style="margin: 24px 0;">
          <a
            href="${safeActionLink}"
            style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px;"
          >
            ${escapeHtml(primaryActionLabel)}
          </a>
        </p>
        <p>Hvis knappen ikke virker, kan du åbne invitationen direkte her:</p>
        <p><a href="${safeLandingUrl}">${safeLandingUrl}</a></p>
      </div>
    `.trim(),
    text: [
      `Du er inviteret til ${context.clubName} som ${roleLabel} i ${config.appName}.`,
      'Du er blevet inviteret og skal først oprette din konto.',
      `Denne invitation er sendt til ${invite.email}.`,
      '',
      `${primaryActionLabel}: ${context.actionLink}`,
      '',
      `Fallback invite-link: ${context.landingUrl}`,
    ].join('\n'),
  };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return toHex(hash);
}

async function hmacSha256(key: Uint8Array, value: string): Promise<Uint8Array> {
  const keyBytes = Uint8Array.from(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value));
  return new Uint8Array(signature);
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

async function createAwsSesAuthorizationHeader(
  payload: string,
  headers: Record<string, string>,
  signingDate: { amzDate: string; dateStamp: string },
  config: Pick<ClubInviteEmailConfig, 'awsAccessKeyId' | 'awsSecretAccessKey' | 'awsRegion'>
): Promise<string> {
  const canonicalHeaders = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), value.trim().replace(/\s+/g, ' ')] as const)
    .sort(([left], [right]) => left.localeCompare(right));

  const signedHeaders = canonicalHeaders.map(([key]) => key).join(';');
  const canonicalHeadersString = canonicalHeaders
    .map(([key, value]) => `${key}:${value}\n`)
    .join('');

  const canonicalRequest = [
    'POST',
    '/v2/email/outbound-emails',
    '',
    canonicalHeadersString,
    signedHeaders,
    await sha256Hex(payload),
  ].join('\n');

  const credentialScope = `${signingDate.dateStamp}/${config.awsRegion}/ses/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    signingDate.amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const secretKey = new TextEncoder().encode(`AWS4${config.awsSecretAccessKey}`);
  const dateKey = await hmacSha256(secretKey, signingDate.dateStamp);
  const regionKey = await hmacSha256(dateKey, config.awsRegion);
  const serviceKey = await hmacSha256(regionKey, 'ses');
  const signingKey = await hmacSha256(serviceKey, 'aws4_request');
  const signature = toHex(Uint8Array.from(await hmacSha256(signingKey, stringToSign)).buffer);

  return [
    `AWS4-HMAC-SHA256 Credential=${config.awsAccessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');
}

async function sendWithAwsSes(
  content: ClubInviteEmailContent,
  invite: Pick<ClubInvite, 'email'>,
  config: Pick<
    ClubInviteEmailConfig,
    'fromEmail' | 'fromName' | 'awsRegion' | 'awsAccessKeyId' | 'awsSecretAccessKey' | 'awsSessionToken'
  >
): Promise<void> {
  const payload = JSON.stringify({
    FromEmailAddress: `${config.fromName} <${config.fromEmail}>`,
    Destination: {
      ToAddresses: [invite.email],
    },
    Content: {
      Simple: {
        Subject: {
          Data: content.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: content.html,
            Charset: 'UTF-8',
          },
          Text: {
            Data: content.text,
            Charset: 'UTF-8',
          },
        },
      },
    },
  });

  const payloadHash = await sha256Hex(payload);
  const signingDate = formatAmzDate(new Date());
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    host: `email.${config.awsRegion}.amazonaws.com`,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': signingDate.amzDate,
  };

  if (config.awsSessionToken) {
    headers['x-amz-security-token'] = config.awsSessionToken;
  }

  headers.authorization = await createAwsSesAuthorizationHeader(payload, headers, signingDate, config);

  const response = await fetch(`https://email.${config.awsRegion}.amazonaws.com/v2/email/outbound-emails`, {
    method: 'POST',
    headers: {
      Authorization: headers.authorization,
      'Content-Type': headers['content-type'],
      Host: headers.host,
      'X-Amz-Content-Sha256': headers['x-amz-content-sha256'],
      'X-Amz-Date': headers['x-amz-date'],
      ...(config.awsSessionToken ? { 'X-Amz-Security-Token': config.awsSessionToken } : {}),
    },
    body: payload,
  });

  if (!response.ok) {
    const failureBody = await response.text();
    console.error('[club-invite-delivery] aws ses failure', {
      status: response.status,
      body: failureBody,
    });
    const normalizedMessage = failureBody.replace(/\s+/g, ' ').trim();
    throw new AppError(
      'INTERNAL_ERROR',
      normalizedMessage ? `Could not send invite email: ${normalizedMessage}` : 'Could not send invite email.',
      500
    );
  }
}

export async function deliverClubInviteEmail(
  client: ClubInviteDeliveryClient,
  invite: ClubInvite,
  options?: {
    clubName?: string;
    config?: ClubInviteEmailConfig;
  }
  ): Promise<ClubInviteEmailDeliveryResult> {
  const configResolution = options?.config
    ? { config: options.config, missing: [] }
    : getClubInviteEmailConfigFromEnv();
  const config = configResolution.config;

  if (!config) {
    const warning = `Invite email skipped: missing ${configResolution.missing.join(', ')}.`;
    console.warn('[club-invite-delivery] skipped', {
      inviteId: invite.id,
      missing: configResolution.missing,
    });
    return {
      status: 'skipped',
      authLinkType: null,
      clubName: options?.clubName?.trim() ?? null,
      landingUrl: null,
      provider: 'none',
      warning,
    };
  }

  let context: ClubInviteDeliveryContext;
  try {
    context = await resolveClubInviteDeliveryContext(client, invite, config, options?.clubName);
  } catch (error) {
    const warning =
      error instanceof AppError
        ? `Invite auth-link generation failed: ${error.message}`
        : 'Invite auth-link generation failed.';
    console.error('[club-invite-delivery] auth-link failed', {
      inviteId: invite.id,
      error,
    });
    return {
      status: 'failed',
      authLinkType: null,
      clubName: options?.clubName?.trim() ?? null,
      landingUrl: buildClubInviteLandingUrl(config.landingUrl, invite),
      provider: 'aws_ses',
      warning,
    };
  }

  const content = buildClubInviteEmailContent(invite, context, config);
  try {
    await sendWithAwsSes(content, invite, config);
  } catch (error) {
    const warning =
      error instanceof AppError
        ? `Invite email send failed: ${error.message}`
        : 'Invite email send failed.';
    console.error('[club-invite-delivery] send failed', {
      inviteId: invite.id,
      error,
    });
    return {
      status: 'failed',
      authLinkType: context.authLinkType,
      clubName: context.clubName,
      landingUrl: context.landingUrl,
      provider: 'aws_ses',
      warning,
    };
  }

  return {
    status: 'sent',
    authLinkType: context.authLinkType,
    clubName: context.clubName,
    landingUrl: context.landingUrl,
    provider: 'aws_ses',
    warning: null,
  };
}
