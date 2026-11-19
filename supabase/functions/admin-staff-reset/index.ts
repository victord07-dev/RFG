import {
  allowedOrigin,
  authenticatedVerifiedAdmin,
  corsHeaders,
  json
} from '../_shared/admin-device.ts';
import { sendStaffAuthEmail, staffRedirectUrl } from '../_shared/staff-auth.ts';

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (request.method === 'OPTIONS') {
    return origin ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 });
  }
  if (!origin) return json({ error: 'Origin not allowed.' }, 403);
  if (request.method !== 'POST') return json({ error: 'POST required.' }, 405, origin);

  try {
    const admin = await authenticatedVerifiedAdmin(request);
    if (!admin) return json({ error: 'Verified Admin access is required.' }, 403, origin);
    const input = await request.json().catch(() => ({})) as { profileId?: string };
    const profileId = String(input.profileId || '');
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(profileId)) return json({ error: 'Choose a valid Sales account.' }, 400, origin);

    const { data: profile, error: profileError } = await admin.supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', profileId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.role !== 'sales' || !profile.email) return json({ error: 'Sales account not found.' }, 404, origin);

    const since = new Date(Date.now() - 60_000).toISOString();
    const { data: recent } = await admin.supabase
      .from('admin_security_events')
      .select('id')
      .eq('admin_id', admin.user.id)
      .eq('event_type', 'sales_password_reset_sent')
      .contains('details', { profile_id: profile.id })
      .gte('created_at', since)
      .limit(1);
    if (recent?.length) return json({ error: 'A reset email was just sent. Wait one minute before trying again.' }, 429, origin);

    const { data: generated, error: generateError } = await admin.supabase.auth.admin.generateLink({
      type: 'recovery',
      email: profile.email,
      options: { redirectTo: staffRedirectUrl(request) }
    });
    if (generateError || !generated.properties?.action_link) throw generateError || new Error('Reset link could not be created.');
    await sendStaffAuthEmail({
      to: profile.email,
      name: profile.full_name,
      actionLink: generated.properties.action_link,
      kind: 'recovery'
    });

    const audit = await admin.supabase.from('activity_logs').insert({
      actor_id: admin.user.id,
      action: 'Admin sent Sales password reset',
      details: { profile_id: profile.id }
    });
    const securityAudit = await admin.supabase.from('admin_security_events').insert({
      admin_id: admin.user.id,
      session_id: admin.sessionId,
      event_type: 'sales_password_reset_sent',
      details: { profile_id: profile.id }
    });
    if (audit.error || securityAudit.error) console.error('Sales password reset audit write failed.');
    return json({ ok: true }, 200, origin);
  } catch (error) {
    console.error('admin-staff-reset failed', error instanceof Error ? error.message : error);
    return json({ error: 'Password reset email could not be sent. Please try again.' }, 500, origin);
  }
});
