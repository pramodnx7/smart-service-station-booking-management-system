const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const supabaseKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
).trim();

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  : null;

function assertSupabaseConfigured() {
  if (supabase) return;
  const error = new Error(
    'Image storage is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.'
  );
  error.status = 503;
  throw error;
}

module.exports = { assertSupabaseConfigured, supabase };
