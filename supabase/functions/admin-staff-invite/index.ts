import {
  allowedOrigin,
  authenticatedVerifiedAdmin,
  corsHeaders,
  json
} from '../_shared/admin-device.ts';
import {
  normalizeStaffEmail,
  sendStaffAuthEmail,
  staffRedirectUrl,
  validStaffEmail,
  validStaffName
} from '../_shared/staff-auth.ts';

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
    const input = await request.json().catch(() => ({})) as { fullName?: string; email?: string; active?: boolean };
    const fullName = String(input.fullName || '').trim();
    const email = normalizeStaffEmail(input.email);
    if (!validStaffName(fullName)) return json({ error: 'Enter a valid staff name.' }, 400, origin);
    if (!validStaffEmail(email)) return json({ error: 'Enter a valid staff email.' }, 400, origin);

    const { count, error: countError } = await admin.supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'sales')
      .eq('active', true);
    if (countError) throw countError;
    if ((count || 0) >= 2) return json({ error: 'The two active Sales account limit has been reached. Deactivate an existing sales member first.' }, 409, origin);

    const { data: existingProfile } = await admin.supabase
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle();
    if (existingProfile) return json({ error: 'A staff account already uses this email.' }, 409, origin);

    const { data: generated, error: generateError } = await admin.supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: { full_name: fullName, role: 'sales' },
        redirectTo: staffRedirectUrl(request)
      }
    });
    if (generateError || !generated.user || !generated.properties?.action_link) {
      throw generateError || new Error('Invitation link could not be created.');
    }

    const shouldActivate = input.active !== false;
    const { error: profileError } = await admin.supabase
      .from('profiles')
      .update({ full_name: fullName, active: shouldActivate })
      .eq('id', generated.user.id);
    if (profileError) {
      await admin.supabase.auth.admin.deleteUser(generated.user.id);
      throw profileError;
    }

    try {
      await sendStaffAuthEmail({ to: email, name: fullName, actionLink: generated.properties.action_link, kind: 'invite' });
    } catch (emailError) {
      await admin.supabase.auth.admin.deleteUser(generated.user.id);
      throw emailError;
    }

    const audit = await admin.supabase.from('activity_logs').insert({
      actor_id: admin.user.id,
      action: 'Admin invited Sales staff',
      details: { profile_id: generated.user.id, email, active: shouldActivate }
    });
    const securityAudit = await admin.supabase.from('admin_security_events').insert({
      admin_id: admin.user.id,
      session_id: admin.sessionId,
      event_type: 'sales_staff_invited',
      details: { profile_id: generated.user.id }
    });
    if (audit.error || securityAudit.error) console.error('Staff invitation audit write failed.');
    return json({ ok: true, profileId: generated.user.id }, 200, origin);
  } catch (error) {
    console.error('admin-staff-invite failed', error instanceof Error ? error.message : error);
    return json({ error: 'Staff invitation could not be completed. Please try again.' }, 500, origin);
  }
});
