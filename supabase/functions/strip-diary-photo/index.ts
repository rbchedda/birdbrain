/**
 * Edge Function: strip-diary-photo
 *
 * Clients POST the image body with x-birdbrain-bucket and x-birdbrain-path.
 * This verifies the JWT, checks the caller's <uid>/ folder, converts to a
 * cleaned JPEG (or rejects the file), and writes with the service role.
 * Raw bytes are never stored. NOT DEPLOYED by this PR — engineer deploys
 * after review, with verify_jwt = true. Never put secret values in this file.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { handleStripRequest } from './handler.mjs';

function envOrThrow(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error('server misconfigured');
  return v;
}

function userClient(token: string): SupabaseClient {
  return createClient(envOrThrow('SUPABASE_URL'), envOrThrow('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function serviceClient(): SupabaseClient {
  return createClient(envOrThrow('SUPABASE_URL'), envOrThrow('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(async (req) => {
  try {
    return await handleStripRequest(req, {
      async getUser(token) {
        const { data, error } = await userClient(token).auth.getUser(token);
        if (error || !data.user) return null;
        return { id: data.user.id };
      },
      async upload(bucket, path, body) {
        const { error } = await serviceClient()
          .storage.from(bucket)
          .upload(path, body, { contentType: 'image/jpeg', upsert: true });
        if (error) throw new Error('upload failed');
      },
    });
  } catch (e) {
    const msg = e instanceof Error && e.message === 'server misconfigured' ? 'server misconfigured' : 'strip failed';
    return new Response(msg, { status: 500 });
  }
});
