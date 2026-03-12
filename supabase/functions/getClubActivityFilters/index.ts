import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { requireAuthContext } from '../_shared/auth.ts';
import {
  getClubActivityFiltersAction,
  parseClubActivityFiltersBody,
} from '../_shared/clubActivities.ts';
import {
  optionsResponse,
  readJsonBody,
  responseFromError,
  successCompatResponse,
} from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse();
  }

  try {
    const body = await readJsonBody(req);
    const input = parseClubActivityFiltersBody(body);
    const { serviceClient, userId } = await requireAuthContext(req);
    const data = await getClubActivityFiltersAction(serviceClient as any, userId, input);
    return successCompatResponse(data);
  } catch (error) {
    return responseFromError(error);
  }
});
