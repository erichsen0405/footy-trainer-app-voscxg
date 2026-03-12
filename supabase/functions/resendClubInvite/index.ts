import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { requireAuthContext } from '../_shared/auth.ts';
import { resendClubInviteAction } from '../_shared/clubAdmin.ts';
import { deliverClubInviteEmail } from '../_shared/clubInviteDelivery.ts';
import { AppError, optionsResponse, readJsonBody, responseFromError, successResponse } from '../_shared/http.ts';

function normalizeStageError(stage: string, error: unknown): AppError {
  if (error instanceof AppError) {
    return new AppError(error.code, `[${stage}] ${error.message}`, error.status);
  }

  if (error instanceof Error && error.message.trim()) {
    return new AppError('INTERNAL_ERROR', `[${stage}] ${error.message.trim()}`, 500);
  }

  if (typeof error === 'string' && error.trim()) {
    return new AppError('INTERNAL_ERROR', `[${stage}] ${error.trim()}`, 500);
  }

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}') {
      return new AppError('INTERNAL_ERROR', `[${stage}] ${serialized}`, 500);
    }
  } catch {
    return new AppError('INTERNAL_ERROR', `[${stage}] Unexpected backend error.`, 500);
  }

  return new AppError('INTERNAL_ERROR', `[${stage}] Unexpected backend error.`, 500);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse();
  }

  try {
    let serviceClient: Awaited<ReturnType<typeof requireAuthContext>>['serviceClient'];
    let userId: string;

    try {
      const authContext = await requireAuthContext(req);
      serviceClient = authContext.serviceClient;
      userId = authContext.userId;
    } catch (error) {
      throw normalizeStageError('auth', error);
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      throw normalizeStageError('body', error);
    }

    let data: Awaited<ReturnType<typeof resendClubInviteAction>>;
    try {
      data = await resendClubInviteAction(serviceClient, userId, body);
    } catch (error) {
      throw normalizeStageError('rpc', error);
    }

    const mailDelivery = await deliverClubInviteEmail(serviceClient, data);
    return successResponse({
      ...data,
      mailDelivery,
    });
  } catch (error) {
    return responseFromError(error);
  }
});
