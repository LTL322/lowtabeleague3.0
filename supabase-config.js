// LTL V2 — public Supabase client configuration.
// Only the project URL and Publishable/anon key belong here.
window.LTL_SUPABASE_CONFIG = {
  url: 'https://mtvudsyvequmvguzyhiw.supabase.co',
  key: 'sb_publishable_bq67S21Ey-yWrx8n7gbTZg_9v_viOlU'
};

function ltlSupabaseConfig() {
  return window.LTL_SUPABASE_CONFIG || { url: '', key: '' };
}
