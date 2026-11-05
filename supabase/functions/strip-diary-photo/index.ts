/**
 * Edge Function: strip-diary-photo
 *
 * Server-side EXIF/XMP/IPTC strip before a diary photo becomes readable on a
 * shared link. NOT DEPLOYED by this PR — code lives in-repo for review + tests.
 *
 * Deploy later (hosted-changes): wire storage webhook / signed upload path to
 * call this with the object bytes; write the derivative; keep or delete original.
 */
import { stripJpegMetadata } from './stripJpegMetadata.mjs';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  const ctype = req.headers.get('content-type') || '';
  if (!ctype.includes('image/jpeg') && !ctype.includes('application/octet-stream')) {
    return new Response('expected image/jpeg body', { status: 415 });
  }
  try {
    const raw = new Uint8Array(await req.arrayBuffer());
    const cleaned = stripJpegMetadata(raw);
    return new Response(cleaned, {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'no-store',
        'x-birdbrain-exif-stripped': '1',
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'strip failed', { status: 400 });
  }
});
