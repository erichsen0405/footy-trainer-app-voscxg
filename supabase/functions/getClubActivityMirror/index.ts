import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { requireAuthContext } from '../_shared/auth.ts';
import {
  getClubActivityMirrorAction,
  parseClubActivityMirrorBody,
} from '../_shared/clubActivities.ts';
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
    const input = parseClubActivityMirrorBody(body);
    const { serviceClient, userId } = await requireAuthContext(req);
    const data = await getClubActivityMirrorAction(serviceClient as any, userId, input);
    return successResponse(data);
  } catch (error) {
    return responseFromError(error);
  }
});
