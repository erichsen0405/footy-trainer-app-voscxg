import { createClient } from 'jsr:@supabase/supabase-js@2';
import { AppError } from './http.ts';

type EdgeClient = ReturnType<typeof createClient>;

export type AuthContext = {
  serviceClient: EdgeClient;
  userId: string;
  userEmail: string | null;
};

export function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new AppError('INTERNAL_ERROR', `Missing ${name}.`, 500);
  }

  return value;
}

export function getServiceClient(): EdgeClient {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireAuthContext(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new AppError('UNAUTHORIZED', 'Missing authorization header.', 401);
  }

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY');
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    throw new AppError('UNAUTHORIZED', 'Unauthorized.', 401);
  }

  const serviceClient = getServiceClient();

  return {
    serviceClient,
    userId: user.id,
    userEmail: user.email ?? null,
  };
}
