import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { requireAuthContext } from '../_shared/auth.ts';
import { listPlatformAdminClubsAction } from '../_shared/clubAdmin.ts';
import { optionsResponse, responseFromError, successResponse } from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse();
  }

  try {
    const { serviceClient, userId } = await requireAuthContext(req);
    const data = await listPlatformAdminClubsAction(serviceClient, userId);
    return successResponse(data);
  } catch (error) {
    return responseFromError(error);
  }
});
