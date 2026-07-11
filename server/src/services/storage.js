// Object storage for uploaded PDFs (Supabase Storage).
//
// Local disk does not persist on serverless hosts (Vercel), so uploaded drafts
// live in a private Supabase Storage bucket instead. We store only the object
// key (e.g. "draft_123.pdf") in draft.source_file_path; the bytes live here.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'drafts';

let client = null;
let bucketReady = false;

function getClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    const err = new Error(
      'PDF storage is not configured: add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to server/.env (see server/.env.example). Pasted-text drafts work without it.'
    );
    err.status = 503;
    err.expose = true;
    throw err;
  }
  if (!client) {
    // Service-role key is server-side only; it bypasses RLS for storage access.
    client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

// Create the private bucket once per process if it doesn't already exist.
async function ensureBucket(supabase) {
  if (bucketReady) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
    // Ignore a race where another invocation created it first.
    if (error && !/exist/i.test(error.message)) throw new Error(error.message);
  }
  bucketReady = true;
}

/** Upload (or overwrite) a PDF by object key. Returns the key. */
export async function uploadPdf(key, buffer) {
  const supabase = getClient();
  await ensureBucket(supabase);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, buffer, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`PDF upload failed: ${error.message}`);
  return key;
}

/** Download a stored PDF by object key as a base64 string. */
export async function downloadPdfBase64(key) {
  const supabase = getClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(key);
  if (error) throw new Error(`PDF download failed: ${error.message}`);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}
