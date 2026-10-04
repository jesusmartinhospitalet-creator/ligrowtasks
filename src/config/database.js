const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (url && key) {
  try {
    supabase = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  } catch (e) {
    console.warn('[database.js] Supabase init warning:', e.message);
  }
}

module.exports = supabase;
