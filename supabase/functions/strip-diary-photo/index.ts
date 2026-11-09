/**
 * Edge Function: strip-diary-photo
 *
 * Overwrites a stored diary-photos or post-photos object with a JPEG that has
 * EXIF/XMP/IPTC stripped. NOT DEPLOYED by this PR — engineer deploys after
 * review, with verify_jwt = true. Never put secret values in this file.
 *
 * Auth: gateway verify_jwt plus supabase.auth.getUser on the caller token.
 * Paths must sit under the caller's own <uid>/ folder in an allowed bucket.
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
      async download(bucket, path) {
        const { data, error } = await serviceClient().storage.from(bucket).download(path);
        if (error || !data) return null;
        return new Uint8Array(await data.arrayBuffer());
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
