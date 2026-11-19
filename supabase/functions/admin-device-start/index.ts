import {
  allowedOrigin,
  authenticatedAdmin,
  corsHeaders,
  json,
  maskEmail,
  otpHash,
  randomOtp,
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
      deviceToken?: string;
      deviceLabel?: string;
    };
    const recipientEmail = (Deno.env.get('ADMIN_OTP_RECIPIENT_EMAIL') || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      throw new Error('Admin OTP recipient is not configured.');
    }
    const userAgent = request.headers.get('user-agent')?.slice(0, 500) || '';

    const { data: existingSession } = await admin.supabase
      .from('admin_verified_sessions')
      .select('session_id, expires_at')
      .eq('session_id', admin.sessionId)
      .eq('admin_id', admin.user.id)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (existingSession) return json({ status: 'verified' }, 200, origin);

    if (input.deviceToken && /^[A-Za-z0-9_-]{40,80}$/.test(input.deviceToken)) {
      const tokenHash = await sha256(input.deviceToken);
      const { data: trusted, error: trustError } = await admin.supabase.rpc('service_trust_admin_session', {
        p_admin_id: admin.user.id,
        p_session_id: admin.sessionId,
        p_token_hash: tokenHash,
        p_user_agent: userAgent
      });
      if (trustError) throw trustError;
      if (trusted) return json({ status: 'verified' }, 200, origin);
    }

    const { data: latest } = await admin.supabase
      .from('admin_device_challenges')
      .select('id, resend_available_at, expires_at')
      .eq('admin_id', admin.user.id)
      .eq('session_id', admin.sessionId)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = Date.now();
    if (latest && new Date(latest.resend_available_at).getTime() > now && new Date(latest.expires_at).getTime() > now) {
      return json({
        status: 'challenge',
        challengeId: latest.id,
        email: maskEmail(recipientEmail),
        retryAfterSeconds: Math.ceil((new Date(latest.resend_available_at).getTime() - now) / 1000)
      }, 200, origin);
    }

    await admin.supabase
      .from('admin_device_challenges')
      .update({ consumed_at: new Date().toISOString() })
      .eq('admin_id', admin.user.id)
      .eq('session_id', admin.sessionId)
      .is('consumed_at', null);

    const challengeId = crypto.randomUUID();
    const otp = randomOtp();
    const hash = await otpHash(challengeId, otp);
    const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
    const resendAt = new Date(now + 60 * 1000).toISOString();
    const { error: challengeError } = await admin.supabase
      .from('admin_device_challenges')
      .insert({
        id: challengeId,
        admin_id: admin.user.id,
        session_id: admin.sessionId,
        otp_hash: hash,
        expires_at: expiresAt,
        resend_available_at: resendAt
      });
    if (challengeError) throw challengeError;

    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('ADMIN_OTP_FROM_EMAIL');
    if (!resendKey || !fromEmail) throw new Error('Admin OTP email provider is not configured.');
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipientEmail],
        subject: 'RFG Admin login verification code',
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#082b28"><h2>Verify this Admin login</h2><p>Use this one-time code to continue:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${otp}</p><p>This code expires in 10 minutes. If you did not attempt to sign in, change your password and contact RFG support.</p><p style="color:#60736e">RFG Financial security</p></div>`
      })
    });
    if (!emailResponse.ok) {
      await admin.supabase.from('admin_device_challenges').update({ consumed_at: new Date().toISOString() }).eq('id', challengeId);
      throw new Error('Admin verification email could not be sent.');
    }

    await admin.supabase.from('admin_security_events').insert({
      admin_id: admin.user.id,
      session_id: admin.sessionId,
      event_type: 'admin_otp_sent',
      details: { challenge_id: challengeId, device_label: (input.deviceLabel || 'Admin browser').slice(0, 120) }
    });

    return json({
      status: 'challenge',
      challengeId,
      email: maskEmail(recipientEmail),
      retryAfterSeconds: 60
    }, 200, origin);
  } catch (error) {
    console.error('admin-device-start failed', error instanceof Error ? error.message : error);
    return json({ error: 'Verification could not start. Please try again or contact support.' }, 500, origin);
  }
});
