import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { requireAuthContext } from '../_shared/auth.ts';
import { createClubInviteAction } from '../_shared/clubAdmin.ts';
import { deliverClubInviteEmail } from '../_shared/clubInviteDelivery.ts';
import { optionsResponse, readJsonBody, responseFromError, successResponse } from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse();
  }

  try {
    const { serviceClient, userId } = await requireAuthContext(req);
    const body = await readJsonBody(req);
    const data = await createClubInviteAction(serviceClient, userId, body);
    const mailDelivery = await deliverClubInviteEmail(serviceClient, data.invite);
    return successResponse({
      ...data,
      mailDelivery,
    });
  } catch (error) {
    return responseFromError(error);
  }
});
