export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CLUB_NOT_FOUND'
  | 'TEAM_NOT_FOUND'
  | 'LICENSE_INACTIVE'
  | 'SEAT_LIMIT_REACHED'
  | 'MEMBER_ALREADY_EXISTS'
  | 'INVITE_ALREADY_PENDING'
  | 'INVITE_NOT_FOUND'
  | 'MEMBER_NOT_FOUND'
  | 'LAST_OWNER_GUARD'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  code: ErrorCode;
  status: number;

  constructor(code: ErrorCode, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function optionsResponse(): Response {
  return new Response('ok', { headers: corsHeaders });
}

export function successResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export function errorResponse(code: ErrorCode, message: string, status = 400): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code,
        message,
      },
    }),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    }
  );
}

export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
  }
}

function serializeUnknownError(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const directMessage = record.message;
    if (typeof directMessage === 'string' && directMessage.trim()) {
      return directMessage.trim();
    }

    const nestedError = record.error;
    if (nestedError && typeof nestedError === 'object') {
      const nestedMessage = (nestedError as Record<string, unknown>).message;
      if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
        return nestedMessage.trim();
      }
    }

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') {
        return serialized;
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function responseFromError(error: unknown): Response {
  if (error instanceof AppError) {
    return errorResponse(error.code, error.message, error.status);
  }

  console.error('[club-admin] unexpected error', error);
  const serializedMessage = serializeUnknownError(error);
  if (serializedMessage) {
    return errorResponse('INTERNAL_ERROR', serializedMessage, 500);
  }

  return errorResponse('INTERNAL_ERROR', 'Unexpected backend error.', 500);
}
