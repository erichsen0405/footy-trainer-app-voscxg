import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { requireAuthContext } from '../_shared/auth.ts';
import { acceptOwnerPlayerGuardianInviteAction } from '../_shared/ownerPlayerCrm.ts';
import { optionsResponse, readJsonBody, responseFromError, successResponse } from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse();
  }

  try {
    const { serviceClient, userId, userEmail } = await requireAuthContext(req);
    const body = await readJsonBody(req);
    const data = await acceptOwnerPlayerGuardianInviteAction(serviceClient as any, userId, userEmail, body);
    return successResponse(data);
  } catch (error) {
    return responseFromError(error);
  }
});
