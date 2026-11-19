import {
  allowedOrigin,
  authenticatedAdmin,
  corsHeaders,
  json,
  otpHash,
  randomDeviceToken,
  sha256
} from '../_shared/admin-device.ts';

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (request.method === 'OPTIONS') {
    return origin ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 });
  }
  if (!origin) return json({ error: 'Origin not allowed.' }, 403);
  if (request.method !== 'POST') return json({ error: 'POST required.' }, 405, origin);

  try {
    const admin = await authenticatedAdmin(request);
    if (!admin) return json({ error: 'Admin authentication required.' }, 401, origin);
    const input = await request.json().catch(() => ({})) as {
      challengeId?: string;
      otp?: string;
      deviceLabel?: string;
    };
    if (!input.challengeId || !/^[0-9]{6}$/.test(input.otp || '')) {
      return json({ status: 'invalid', error: 'Enter the 6-digit code.' }, 400, origin);
    }

    const candidateHash = await otpHash(input.challengeId, input.otp!);
    const deviceToken = randomDeviceToken();
    const deviceTokenHash = await sha256(deviceToken);
    const { data, error } = await admin.supabase.rpc('service_complete_admin_device_challenge', {
      p_challenge_id: input.challengeId,
      p_admin_id: admin.user.id,
      p_session_id: admin.sessionId,
      p_candidate_hash: candidateHash,
      p_device_token_hash: deviceTokenHash,
      p_device_label: (input.deviceLabel || 'Admin browser').slice(0, 120),
      p_user_agent: request.headers.get('user-agent')?.slice(0, 500) || ''
    });
    if (error) throw error;
    const result = data as { status?: string; attempts_remaining?: number } | null;
    if (result?.status !== 'verified') return json(result || { status: 'invalid' }, 200, origin);

    return json({ status: 'verified', deviceToken }, 200, origin);
  } catch (error) {
    console.error('admin-device-verify failed', error instanceof Error ? error.message : error);
    return json({ error: 'Verification could not be completed.' }, 500, origin);
  }
});

