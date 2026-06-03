import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { requireAuthContext } from '../_shared/auth.ts';
import { createClubActivityCategoryAction } from '../_shared/clubCategories.ts';
import { optionsResponse, readJsonBody, responseFromError, successResponse } from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse();
  }

  try {
    const { serviceClient, userId } = await requireAuthContext(req);
    const body = await readJsonBody(req);
    const data = await createClubActivityCategoryAction(serviceClient, userId, body);
    return successResponse(data, 201);
  } catch (error) {
    return responseFromError(error);
  }
});
