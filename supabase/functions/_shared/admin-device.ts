import { createClient } from 'npm:@supabase/supabase-js@2';

export const json = (body: unknown, status = 200, origin?: string) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(origin ? corsHeaders(origin) : {})
    }
  }
);

export const allowedOrigin = (request: Request) => {
  const origin = request.headers.get('origin') || '';
  const configured = (Deno.env.get('APP_ORIGINS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
  return configured.includes(origin) || local ? origin : '';
};

export const corsHeaders = (origin: string) => ({
  'access-control-allow-origin': origin,
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '600',
  vary: 'Origin'
});

export const serviceClient = () => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY');
  if (!url || !key) throw new Error('Supabase server credentials are unavailable.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

const bearerToken = (request: Request) => {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return '';
  return authorization.slice(7).trim();
};

const decodeJwtPayload = (token: string) => {
  const part = token.split('.')[1];
  if (!part) return {} as Record<string, unknown>;
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(atob(padded)) as Record<string, unknown>;
};

export const authenticatedAdmin = async (request: Request) => {
  const token = bearerToken(request);
  if (!token) return null;
  const supabase = serviceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, role, active')
    .eq('id', data.user.id)
    .maybeSingle();
  if (!profile?.active || profile.role !== 'admin') return null;
  const claims = decodeJwtPayload(token);
  const sessionId = typeof claims.session_id === 'string' ? claims.session_id : '';
  if (!sessionId) return null;
  return { supabase, user: data.user, profile, sessionId };
};

export const authenticatedVerifiedAdmin = async (request: Request) => {
  const admin = await authenticatedAdmin(request);
  if (!admin) return null;
  const { data: verifiedSession, error } = await admin.supabase
    .from('admin_verified_sessions')
    .select('session_id')
    .eq('session_id', admin.sessionId)
    .eq('admin_id', admin.user.id)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error || !verifiedSession) return null;
  return admin;
};

export const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const randomOtp = () => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(100000 + (values[0] % 900000));
};

export const randomDeviceToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

export const otpHash = (challengeId: string, otp: string) => {
  const pepper = Deno.env.get('ADMIN_OTP_PEPPER');
  if (!pepper || pepper.length < 32) throw new Error('ADMIN_OTP_PEPPER is not configured securely.');
  return sha256(`${pepper}:${challengeId}:${otp}`);
};

export const maskEmail = (email: string) => {
  const [name = '', domain = ''] = email.split('@');
  const visible = name.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(name.length - 2, 3))}@${domain}`;
};
