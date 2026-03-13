import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { requireAuthContext } from '../_shared/auth.ts';
import {
  buildTrainerFeedbackPushPayload,
  deliverTrainerFeedbackEmail,
  deliverTrainerFeedbackPush,
} from '../_shared/trainerFeedbackDelivery.ts';
import {
  AppError,
  optionsResponse,
  readJsonBody,
  responseFromError,
  successResponse,
} from '../_shared/http.ts';

type RequestBody = {
  activityId?: unknown;
  playerId?: unknown;
  feedbackText?: unknown;
};

type ActivityContext = {
  activityContextType: 'internal' | 'external';
  activityContextId: string;
  activityTitle: string;
  recipientActivityId: string;
};

function normalizeId(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function requireId(label: string, value: unknown): string {
  const normalized = normalizeId(value);
  if (!normalized) {
    throw new AppError('VALIDATION_ERROR', `Missing ${label}.`, 400);
  }
  return normalized;
}

function requireFeedbackText(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'feedbackText must be a string.', 400);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new AppError('VALIDATION_ERROR', 'feedbackText cannot be empty.', 400);
  }

  return normalized;
}

async function requireTrainerRole(serviceClient: any, userId: string): Promise<void> {
  const { data, error } = await serviceClient
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', 'Could not resolve user role.', 500);
  }

  const role = typeof data?.role === 'string' ? data.role.toLowerCase() : '';
  if (role !== 'trainer' && role !== 'admin') {
    throw new AppError('FORBIDDEN', 'Only trainers can send player feedback.', 403);
  }
}

async function resolveTrainerName(serviceClient: any, userId: string, fallbackEmail: string | null): Promise<string> {
  try {
    const { data } = await serviceClient
      .from('profiles')
      .select('full_name')
      .eq('user_id', userId)
      .maybeSingle();

    const fullName = typeof data?.full_name === 'string' ? data.full_name.trim() : '';
    if (fullName) return fullName;
  } catch {
    // Fall through to email fallback.
  }

  const emailPrefix = typeof fallbackEmail === 'string' ? fallbackEmail.split('@')[0]?.trim() : '';
  return emailPrefix || 'Din træner';
}

async function resolvePlayerEmail(serviceClient: any, playerId: string): Promise<string> {
  const { data, error } = await serviceClient.auth.admin.getUserById(playerId);
  if (error) {
    throw new AppError('INTERNAL_ERROR', 'Could not resolve player email.', 500);
  }

  const email = typeof data?.user?.email === 'string' ? data.user.email.trim().toLowerCase() : '';
  if (!email) {
    throw new AppError('INTERNAL_ERROR', 'Player email is missing.', 500);
  }

  return email;
}

async function resolveInternalActivityContext(args: {
  serviceClient: any;
  trainerId: string;
  activityId: string;
  playerId: string;
}): Promise<ActivityContext | null> {
  const { serviceClient, trainerId, activityId, playerId } = args;
  const { data: activityRow, error: activityError } = await serviceClient
    .from('activities')
    .select('id, title, user_id, is_external, source_activity_id')
    .eq('id', activityId)
    .maybeSingle();

  if (activityError) {
    throw new AppError('INTERNAL_ERROR', 'Could not load activity.', 500);
  }

  if (!activityRow || activityRow.is_external === true) {
    return null;
  }

  let sourceActivityId = '';
  let activityTitle = typeof activityRow.title === 'string' ? activityRow.title.trim() : 'Aktivitet';

  if (activityRow.user_id === trainerId && !activityRow.source_activity_id) {
    sourceActivityId = String(activityRow.id);
  } else if (activityRow.source_activity_id) {
    const { data: sourceRow, error: sourceError } = await serviceClient
      .from('activities')
      .select('id, title, user_id, is_external')
      .eq('id', activityRow.source_activity_id)
      .eq('user_id', trainerId)
      .eq('is_external', false)
      .maybeSingle();

    if (sourceError) {
      throw new AppError('INTERNAL_ERROR', 'Could not load source activity.', 500);
    }

    if (!sourceRow) {
      return null;
    }

    sourceActivityId = String(sourceRow.id);
    activityTitle = typeof sourceRow.title === 'string' && sourceRow.title.trim() ? sourceRow.title.trim() : activityTitle;
  } else {
    return null;
  }

  const { data: recipientRow, error: recipientError } = await serviceClient
    .from('activities')
    .select('id')
    .eq('source_activity_id', sourceActivityId)
    .eq('user_id', playerId)
    .eq('is_external', false)
    .maybeSingle();

  if (recipientError) {
    throw new AppError('INTERNAL_ERROR', 'Could not resolve player activity.', 500);
  }

  if (!recipientRow?.id) {
    throw new AppError('FORBIDDEN', 'Player is not attached to this activity.', 403);
  }

  return {
    activityContextType: 'internal',
    activityContextId: sourceActivityId,
    activityTitle,
    recipientActivityId: String(recipientRow.id),
  };
}

async function resolveExternalActivityContext(args: {
  serviceClient: any;
  trainerId: string;
  activityId: string;
  playerId: string;
}): Promise<ActivityContext | null> {
  const { serviceClient, trainerId, activityId, playerId } = args;

  const { data: localMetaRow, error: localMetaError } = await serviceClient
    .from('events_local_meta')
    .select(`
      id,
      user_id,
      external_event_id,
      source_local_meta_id,
      local_title_override,
      events_external (
        id,
        title
      )
    `)
    .eq('id', activityId)
    .maybeSingle();

  if (localMetaError) {
    throw new AppError('INTERNAL_ERROR', 'Could not load external activity.', 500);
  }

  let externalEventId = '';
  let activityTitle = 'Aktivitet';

  if (localMetaRow) {
    activityTitle =
      typeof localMetaRow.local_title_override === 'string' && localMetaRow.local_title_override.trim()
        ? localMetaRow.local_title_override.trim()
        : typeof localMetaRow.events_external?.title === 'string' && localMetaRow.events_external.title.trim()
          ? localMetaRow.events_external.title.trim()
          : activityTitle;

    if (localMetaRow.user_id === trainerId && localMetaRow.external_event_id) {
      externalEventId = String(localMetaRow.external_event_id);
    } else if (localMetaRow.source_local_meta_id) {
      const { data: sourceMetaRow, error: sourceMetaError } = await serviceClient
        .from('events_local_meta')
        .select(`
          id,
          user_id,
          external_event_id,
          local_title_override,
          events_external (
            id,
            title
          )
        `)
        .eq('id', localMetaRow.source_local_meta_id)
        .eq('user_id', trainerId)
        .maybeSingle();

      if (sourceMetaError) {
        throw new AppError('INTERNAL_ERROR', 'Could not load source external activity.', 500);
      }

      if (!sourceMetaRow?.external_event_id) {
        return null;
      }

      externalEventId = String(sourceMetaRow.external_event_id);
      activityTitle =
        typeof sourceMetaRow.local_title_override === 'string' && sourceMetaRow.local_title_override.trim()
          ? sourceMetaRow.local_title_override.trim()
          : typeof sourceMetaRow.events_external?.title === 'string' && sourceMetaRow.events_external.title.trim()
            ? sourceMetaRow.events_external.title.trim()
            : activityTitle;
    }
  }

  if (!externalEventId) {
    const { data: externalEventRow, error: externalEventError } = await serviceClient
      .from('events_external')
      .select(`
        id,
        title,
        provider_calendar_id,
        external_calendars!inner (
          id,
          user_id
        )
      `)
      .eq('id', activityId)
      .maybeSingle();

    if (externalEventError) {
      throw new AppError('INTERNAL_ERROR', 'Could not load source external event.', 500);
    }

    if (!externalEventRow || externalEventRow.external_calendars?.user_id !== trainerId) {
      return null;
    }

    externalEventId = String(externalEventRow.id);
    activityTitle =
      typeof externalEventRow.title === 'string' && externalEventRow.title.trim()
        ? externalEventRow.title.trim()
        : activityTitle;
  }

  const { data: recipientRow, error: recipientError } = await serviceClient
    .from('events_local_meta')
    .select('id')
    .eq('external_event_id', externalEventId)
    .eq('user_id', playerId)
    .maybeSingle();

  if (recipientError) {
    throw new AppError('INTERNAL_ERROR', 'Could not resolve player external activity.', 500);
  }

  if (!recipientRow?.id) {
    throw new AppError('FORBIDDEN', 'Player is not attached to this activity.', 403);
  }

  return {
    activityContextType: 'external',
    activityContextId: externalEventId,
    activityTitle,
    recipientActivityId: String(recipientRow.id),
  };
}

async function resolveActivityContext(args: {
  serviceClient: any;
  trainerId: string;
  activityId: string;
  playerId: string;
}): Promise<ActivityContext> {
  const internalContext = await resolveInternalActivityContext(args);
  if (internalContext) return internalContext;

  const externalContext = await resolveExternalActivityContext(args);
  if (externalContext) return externalContext;

  throw new AppError('FORBIDDEN', 'Activity not found or not allowed for this trainer.', 403);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse();
  }

  try {
    const { serviceClient, userId, userEmail } = await requireAuthContext(req);
    await requireTrainerRole(serviceClient, userId);

    const body = (await readJsonBody(req)) as RequestBody;
    const activityId = requireId('activityId', body.activityId);
    const playerId = requireId('playerId', body.playerId);
    const feedbackText = requireFeedbackText(body.feedbackText);

    if (playerId === userId) {
      throw new AppError('VALIDATION_ERROR', 'Trainer feedback cannot target the trainer.', 400);
    }

    const activityContext = await resolveActivityContext({
      serviceClient,
      trainerId: userId,
      activityId,
      playerId,
    });

    const { data: savedRow, error: saveError } = await serviceClient
      .from('trainer_activity_feedback')
      .upsert(
        {
          activity_context_type: activityContext.activityContextType,
          activity_context_id: activityContext.activityContextId,
          player_id: playerId,
          trainer_id: userId,
          feedback_text: feedbackText,
        },
        {
          onConflict: 'activity_context_type,activity_context_id,player_id,trainer_id',
        }
      )
      .select('*')
      .single();

    if (saveError || !savedRow) {
      throw new AppError('INTERNAL_ERROR', 'Could not save trainer feedback.', 500);
    }

    const trainerName = await resolveTrainerName(serviceClient, userId, userEmail);
    const playerEmail = await resolvePlayerEmail(serviceClient, playerId);

    const pushPayload = buildTrainerFeedbackPushPayload({
      activityId: activityContext.recipientActivityId,
      activityTitle: activityContext.activityTitle,
      trainerName,
      feedbackText,
    });

    const [mailDelivery, pushDelivery] = await Promise.all([
      deliverTrainerFeedbackEmail(playerEmail, {
        activityId: activityContext.recipientActivityId,
        activityTitle: activityContext.activityTitle,
        trainerName,
        feedbackText,
      }),
      deliverTrainerFeedbackPush(serviceClient, playerId, pushPayload),
    ]);

    return successResponse({
      feedback: {
        id: String(savedRow.id),
        activityContextType: String(savedRow.activity_context_type),
        activityContextId: String(savedRow.activity_context_id),
        playerId: String(savedRow.player_id),
        trainerId: String(savedRow.trainer_id),
        feedbackText: String(savedRow.feedback_text),
        createdAt: String(savedRow.created_at),
        updatedAt: String(savedRow.updated_at),
      },
      delivery: {
        mail: mailDelivery,
        push: pushDelivery,
      },
    });
  } catch (error) {
    return responseFromError(error);
  }
});
