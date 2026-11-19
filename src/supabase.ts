import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const rememberDeviceKey = 'rfg-remember-device';

const browserAuthStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    const rememberDevice = window.localStorage.getItem(rememberDeviceKey) !== 'false';
    return rememberDevice ? window.localStorage.getItem(key) : window.sessionStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    const rememberDevice = window.localStorage.getItem(rememberDeviceKey) !== 'false';
    if (rememberDevice) {
      window.sessionStorage.removeItem(key);
      window.localStorage.setItem(key, value);
      return;
    }
    window.localStorage.removeItem(key);
    window.sessionStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
};

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: browserAuthStorage
      }
    })
  : null;
