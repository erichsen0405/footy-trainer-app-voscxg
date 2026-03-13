// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { AppError } from './http.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type QueryBuilder<T> = PromiseLike<{ data: T[] | null; error: unknown | null }> & {
  select: (columns: string) => QueryBuilder<T>;
  eq: (column: string, value: unknown) => QueryBuilder<T>;
};

type PushDeliveryClient = {
  from: (table: string) => QueryBuilder<{ expo_push_token: string | null }>;
};

export type TrainerFeedbackPushPayload = {
  title: string;
  body: string;
  data: Record<string, unknown>;
};

export type TrainerFeedbackEmailConfig = {
  appName: string;
  appScheme: string;
  fromEmail: string;
  fromName: string;
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken: string | null;
};

export type TrainerFeedbackEmailContent = {
  subject: string;
  html: string;
  text: string;
};

export type TrainerFeedbackPushDeliveryResult = {
  status: 'sent' | 'skipped' | 'failed';
  tokenCount: number;
  warning: string | null;
};

export type TrainerFeedbackEmailDeliveryResult = {
  status: 'sent' | 'skipped' | 'failed';
  provider: 'aws_ses' | 'none';
  warning: string | null;
};

type TrainerFeedbackEmailConfigResolution = {
  config: TrainerFeedbackEmailConfig | null;
  missing: string[];
};

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

function optionalEnv(primary: string, fallback: string | null): string {
  return getEnv(primary) ?? fallback ?? '';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : fallback;
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatFeedbackHtml(feedbackText: string): string {
  return escapeHtml(feedbackText).replace(/\n/g, '<br />');
}

export function buildTrainerFeedbackPath(activityId: string): string {
  const normalizedActivityId = String(activityId ?? '').trim();
  if (!normalizedActivityId) {
    throw new Error('Missing activityId for trainer feedback deeplink.');
  }

  const params = new URLSearchParams({
    id: normalizedActivityId,
    activityId: normalizedActivityId,
  });
  return `/activity-details?${params.toString()}`;
}

export function buildTrainerFeedbackAppUrl(activityId: string, appScheme = 'footballcoach'): string {
  const normalizedScheme = sanitizeLabel(appScheme, 'footballcoach');
  return new URL(buildTrainerFeedbackPath(activityId), `${normalizedScheme}://`).toString();
}

export function buildTrainerFeedbackPushPayload(args: {
  activityId: string;
  activityTitle?: string | null;
  trainerName?: string | null;
  feedbackText: string;
}): TrainerFeedbackPushPayload {
  const trainerName = sanitizeLabel(args.trainerName, 'Din træner');
  const activityTitle = sanitizeLabel(args.activityTitle, 'aktiviteten');
  const feedbackPreview = truncate(String(args.feedbackText ?? ''), 120);

  return {
    title: 'Ny feedback fra træner',
    body: `${trainerName} har sendt feedback på ${activityTitle}.`,
    data: {
      type: 'trainer-feedback',
      activityId: String(args.activityId ?? '').trim(),
      url: buildTrainerFeedbackPath(args.activityId),
      feedbackPreview,
    },
  };
}

export function buildTrainerFeedbackEmailContent(
  args: {
    activityId: string;
    activityTitle?: string | null;
    trainerName?: string | null;
    feedbackText: string;
  },
  config: Pick<TrainerFeedbackEmailConfig, 'appName' | 'appScheme'>
): TrainerFeedbackEmailContent {
  const trainerName = sanitizeLabel(args.trainerName, 'Din træner');
  const activityTitle = sanitizeLabel(args.activityTitle, 'aktiviteten');
  const appName = sanitizeLabel(config.appName, 'Footy Trainer');
  const activityUrl = buildTrainerFeedbackAppUrl(args.activityId, config.appScheme);
  const safeTrainerName = escapeHtml(trainerName);
  const safeActivityTitle = escapeHtml(activityTitle);
  const safeAppName = escapeHtml(appName);
  const safeActivityUrl = escapeHtml(activityUrl);
  const safeFeedbackText = formatFeedbackHtml(String(args.feedbackText ?? '').trim());

  return {
    subject: 'Ny feedback fra din træner',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <p>Hej,</p>
        <p>Du har modtaget ny feedback fra <strong>${safeTrainerName}</strong> i ${safeAppName}.</p>
        <p><strong>Aktivitet:</strong> ${safeActivityTitle}</p>
        <div style="margin: 16px 0; padding: 16px; border-radius: 12px; background: #f3f4f6;">
          <div style="font-weight: 700; margin-bottom: 8px;">Feedback</div>
          <div>${safeFeedbackText}</div>
        </div>
        <p style="margin: 24px 0;">
          <a
            href="${safeActivityUrl}"
            style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px;"
          >
            Åbn aktivitet i appen
          </a>
        </p>
        <p>Hvis knappen ikke virker, kan du bruge dette link direkte:</p>
        <p><a href="${safeActivityUrl}">${safeActivityUrl}</a></p>
      </div>
    `.trim(),
    text: [
      `Du har modtaget ny feedback fra ${trainerName} i ${appName}.`,
      `Aktivitet: ${activityTitle}`,
      '',
      'Feedback:',
      String(args.feedbackText ?? '').trim(),
      '',
      `Åbn aktivitet i appen: ${activityUrl}`,
    ].join('\n'),
  };
}

export function getTrainerFeedbackEmailConfigFromEnv(): TrainerFeedbackEmailConfigResolution {
  const fromEmail =
    getEnv('TRAINER_FEEDBACK_FROM_EMAIL') ??
    getEnv('CLUB_INVITE_FROM_EMAIL');
  const requiredEnv = {
    fromEmail,
    awsRegion: getEnv('AWS_SES_REGION'),
    awsAccessKeyId: getEnv('AWS_SES_ACCESS_KEY_ID'),
    awsSecretAccessKey: getEnv('AWS_SES_SECRET_ACCESS_KEY'),
  } as const;

  const missing = Object.entries(requiredEnv)
    .filter(([, value]) => !value)
    .map(([key]) => {
      switch (key) {
        case 'fromEmail':
          return 'TRAINER_FEEDBACK_FROM_EMAIL/CLUB_INVITE_FROM_EMAIL';
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
      appName: optionalEnv('TRAINER_FEEDBACK_APP_NAME', getEnv('CLUB_INVITE_APP_NAME') ?? 'Footy Trainer'),
      appScheme: optionalEnv('TRAINER_FEEDBACK_APP_SCHEME', 'footballcoach'),
      fromEmail: requiredEnv.fromEmail!,
      fromName: optionalEnv('TRAINER_FEEDBACK_FROM_NAME', getEnv('CLUB_INVITE_FROM_NAME') ?? 'Footy Trainer'),
      awsRegion: requiredEnv.awsRegion!,
      awsAccessKeyId: requiredEnv.awsAccessKeyId!,
      awsSecretAccessKey: requiredEnv.awsSecretAccessKey!,
      awsSessionToken: getEnv('AWS_SES_SESSION_TOKEN'),
    },
    missing: [],
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
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(key).buffer,
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
  config: Pick<TrainerFeedbackEmailConfig, 'awsAccessKeyId' | 'awsSecretAccessKey' | 'awsRegion'>
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
  content: TrainerFeedbackEmailContent,
  recipientEmail: string,
  config: Pick<
    TrainerFeedbackEmailConfig,
    'fromEmail' | 'fromName' | 'awsRegion' | 'awsAccessKeyId' | 'awsSecretAccessKey' | 'awsSessionToken'
  >
): Promise<void> {
  const payload = JSON.stringify({
    FromEmailAddress: `${config.fromName} <${config.fromEmail}>`,
    Destination: {
      ToAddresses: [recipientEmail],
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
    const normalizedMessage = failureBody.replace(/\s+/g, ' ').trim();
    throw new AppError(
      'INTERNAL_ERROR',
      normalizedMessage ? `Could not send trainer feedback email: ${normalizedMessage}` : 'Could not send trainer feedback email.',
      500
    );
  }
}

export async function deliverTrainerFeedbackEmail(
  recipientEmail: string,
  args: {
    activityId: string;
    activityTitle?: string | null;
    trainerName?: string | null;
    feedbackText: string;
  },
  options?: {
    config?: TrainerFeedbackEmailConfig;
  }
): Promise<TrainerFeedbackEmailDeliveryResult> {
  const configResolution = options?.config
    ? { config: options.config, missing: [] }
    : getTrainerFeedbackEmailConfigFromEnv();
  const config = configResolution.config;

  if (!config) {
    return {
      status: 'skipped',
      provider: 'none',
      warning: `Trainer feedback email skipped: missing ${configResolution.missing.join(', ')}.`,
    };
  }

  const content = buildTrainerFeedbackEmailContent(args, config);

  try {
    await sendWithAwsSes(content, recipientEmail, config);
    return {
      status: 'sent',
      provider: 'aws_ses',
      warning: null,
    };
  } catch (error) {
    console.error('[trainer-feedback-delivery] email failed', error);
    return {
      status: 'failed',
      provider: 'aws_ses',
      warning:
        error instanceof AppError
          ? `Trainer feedback email send failed: ${error.message}`
          : 'Trainer feedback email send failed.',
    };
  }
}

export async function deliverTrainerFeedbackPush(
  client: PushDeliveryClient,
  userId: string,
  payload: TrainerFeedbackPushPayload
): Promise<TrainerFeedbackPushDeliveryResult> {
  try {
    const builder = client
      .from('user_push_tokens')
      .select('expo_push_token')
      .eq('user_id', userId);
    const { data: tokenRows, error: tokenError } = await builder;

    if (tokenError) {
      console.error('[trainer-feedback-delivery] failed to load push tokens', tokenError);
      return {
        status: 'failed',
        tokenCount: 0,
        warning: 'Could not load push tokens.',
      };
    }

    const tokens = (tokenRows ?? [])
      .map((row: any) => row?.expo_push_token)
      .filter((token: unknown): token is string => typeof token === 'string' && token.startsWith('ExponentPushToken'));

    if (!tokens.length) {
      return {
        status: 'skipped',
        tokenCount: 0,
        warning: 'No push tokens for player.',
      };
    }

    const messages = tokens.map((to) => ({
      to,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data,
      priority: 'high',
    }));

    const pushResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!pushResponse.ok) {
      const pushText = await pushResponse.text();
      console.error('[trainer-feedback-delivery] expo push failed', {
        status: pushResponse.status,
        body: pushText,
      });
      return {
        status: 'failed',
        tokenCount: tokens.length,
        warning: 'Expo push send failed.',
      };
    }

    return {
      status: 'sent',
      tokenCount: tokens.length,
      warning: null,
    };
  } catch (error) {
    console.error('[trainer-feedback-delivery] unexpected push failure', error);
    return {
      status: 'failed',
      tokenCount: 0,
      warning: 'Unexpected push error.',
    };
  }
}
