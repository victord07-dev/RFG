import { createClient } from 'npm:@supabase/supabase-js@2';

const required = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const serviceClient = () => createClient(
  required('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || required('SUPABASE_SECRET_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const response = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { 'cache-control': 'no-store' }
});

const countRows = async (
  supabase: ReturnType<typeof serviceClient>,
  table: 'loan_applications' | 'cash_payment_requests',
  status: string
) => {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('status', status);
  if (error) throw error;
  return count || 0;
};

const oldestCreatedAt = async (
  supabase: ReturnType<typeof serviceClient>,
  table: 'loan_applications' | 'cash_payment_requests',
  status: string
) => {
  const { data, error } = await supabase
    .from(table)
    .select('created_at')
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.created_at ? new Date(data.created_at).getTime() : null;
};

const oldestApprovedAt = async (supabase: ReturnType<typeof serviceClient>) => {
  const { data, error } = await supabase
    .from('loan_applications')
    .select('approved_at')
    .eq('status', 'approved')
    .not('approved_at', 'is', null)
    .order('approved_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.approved_at ? new Date(data.approved_at).getTime() : null;
};

const latest = (...values: Array<number | null>) => {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return valid.length ? Math.max(...valid) : null;
};

const earliest = (...values: Array<number | null>) => {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return valid.length ? Math.min(...valid) : null;
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return response({ error: 'POST required.' }, 405);
  const expectedSecret = required('ADMIN_ATTENTION_CRON_SECRET');
  if (request.headers.get('x-cron-secret') !== expectedSecret) return response({ error: 'Unauthorized.' }, 401);

  try {
    const supabase = serviceClient();
    const { data: admin, error: adminError } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('active', true)
      .limit(1)
      .maybeSingle();
    if (adminError) throw adminError;
    if (!admin) return response({ ok: true, action: 'skipped', reason: 'no_active_admin' });

    const [processingCount, activationCount, paymentCount, processingOldest, activationOldest, paymentOldest] = await Promise.all([
      countRows(supabase, 'loan_applications', 'under_processing'),
      countRows(supabase, 'loan_applications', 'approved'),
      countRows(supabase, 'cash_payment_requests', 'verification_pending'),
      oldestCreatedAt(supabase, 'loan_applications', 'under_processing'),
      oldestApprovedAt(supabase),
      oldestCreatedAt(supabase, 'cash_payment_requests', 'verification_pending')
    ]);
    const attentionCount = processingCount + activationCount + paymentCount;
    const oldestPendingAt = earliest(processingOldest, activationOldest, paymentOldest);

    const { data: state, error: stateError } = await supabase
      .from('admin_attention_state')
      .select('*')
      .eq('admin_id', admin.id)
      .maybeSingle();
    if (stateError) throw stateError;

    const now = Date.now();
    const heartbeatAt = state?.last_heartbeat_at ? new Date(state.last_heartbeat_at).getTime() : null;
    const openedAt = state?.last_opened_at ? new Date(state.last_opened_at).getTime() : null;
    const reminderAt = state?.last_reminder_at ? new Date(state.last_reminder_at).getTime() : null;
    const adminActive = heartbeatAt !== null && now - heartbeatAt < 10 * 60 * 1000;
    const reminderCooldownComplete = reminderAt === null || now - reminderAt >= 24 * 60 * 60 * 1000;
    const unseenBaseline = latest(oldestPendingAt, openedAt);
    const pendingFor24Hours = unseenBaseline !== null && now - unseenBaseline >= 24 * 60 * 60 * 1000;
    const thresholdReached = attentionCount >= 10;

    if (!attentionCount || adminActive || !reminderCooldownComplete || (!pendingFor24Hours && !thresholdReached)) {
      return response({
        ok: true,
        action: 'skipped',
        reason: !attentionCount ? 'nothing_pending' : adminActive ? 'admin_active' : !reminderCooldownComplete ? 'cooldown' : 'not_due',
        attentionCount
      });
    }

    const reason = thresholdReached && pendingFor24Hours
      ? 'high_count_and_24h_unseen'
      : thresholdReached ? 'high_count' : '24h_unseen';
    const recipient = required('ADMIN_OTP_RECIPIENT_EMAIL');
    const from = required('ADMIN_OTP_FROM_EMAIL');
    const resendKey = required('RESEND_API_KEY');
    const appUrl = (Deno.env.get('APP_BASE_URL') || '').trim();
    const subject = thresholdReached
      ? `RFG Admin: ${attentionCount} items need attention`
      : 'RFG Admin: pending work has been waiting for 24 hours';
    const email = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#082b28"><h2>Admin attention required</h2><p><strong>${attentionCount} items</strong> currently need review in the RFG Admin panel.</p><ul><li>${processingCount} loan applications awaiting review</li><li>${activationCount} approved loans awaiting activation</li><li>${paymentCount} payments awaiting verification</li></ul><p>${pendingFor24Hours ? 'At least one item has remained unseen for more than 24 hours.' : 'The pending queue has reached 10 or more items while the Admin panel is inactive.'}</p>${appUrl ? `<p><a href="${appUrl}" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#087858;color:#fff;text-decoration:none;font-weight:700">Open RFG Admin</a></p>` : ''}<p style="color:#60736e">This reminder pauses automatically while the verified Admin panel is active.</p></div>`
      })
    });
    if (!email.ok) throw new Error(`Resend rejected the reminder (${email.status}).`);

    const timestamp = new Date().toISOString();
    const { error: updateError } = await supabase.from('admin_attention_state').upsert({
      admin_id: admin.id,
      last_reminder_at: timestamp,
      last_reminder_reason: reason,
      last_reminder_count: attentionCount,
      updated_at: timestamp
    }, { onConflict: 'admin_id' });
    if (updateError) throw updateError;
    await supabase.from('admin_security_events').insert({
      admin_id: admin.id,
      event_type: 'admin_attention_reminder_sent',
      details: { reason, attention_count: attentionCount, processing_count: processingCount, activation_count: activationCount, payment_count: paymentCount }
    });

    return response({ ok: true, action: 'sent', reason, attentionCount });
  } catch (error) {
    console.error('admin-attention-reminder failed', error instanceof Error ? error.message : error);
    return response({ error: 'Admin reminder could not be processed.' }, 500);
  }
});
