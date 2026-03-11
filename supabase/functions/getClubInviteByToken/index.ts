import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getServiceClient } from '../_shared/auth.ts';
import { getClubInviteByTokenAction } from '../_shared/clubAdmin.ts';
import { optionsResponse, readJsonBody, responseFromError, successResponse } from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse();
  }

  try {
    const serviceClient = getServiceClient();
    const body = await readJsonBody(req);
    const data = await getClubInviteByTokenAction(serviceClient, body);
    return successResponse(data);
  } catch (error) {
    return responseFromError(error);
  }
});
