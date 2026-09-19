import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://erdltqfqxrtiqdmtvunl.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_0XXgHwC0rUBXJh81WG9vJw_M_srz_X0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
