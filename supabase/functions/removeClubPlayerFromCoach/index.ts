import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { requireAuthContext } from '../_shared/auth.ts';
import { removeClubPlayerFromCoachAction } from '../_shared/clubMemberManagement.ts';
import {
  optionsResponse,
  readJsonBody,
  responseFromError,
  successResponse,
} from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse();
  }

  try {
    const body = await readJsonBody(req);
    const { serviceClient, userId } = await requireAuthContext(req);
    const data = await removeClubPlayerFromCoachAction(serviceClient as any, userId, body);
    return successResponse(data);
  } catch (error) {
    return responseFromError(error);
  }
});
