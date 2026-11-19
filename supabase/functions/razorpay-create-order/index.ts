import {
  allowedOrigin, basicAuth, corsHeaders, gatewayAmounts, json, payableAmount, publicError,
  razorpayConfig, resolveCustomerSession
} from '../_shared/razorpay.ts';

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (request.method === 'OPTIONS') return origin ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 });
  if (!origin) return publicError('Origin not allowed.', 403);
  if (request.method !== 'POST') return publicError('POST required.', 405, origin);

  try {
    const input = await request.json().catch(() => ({})) as { customerSessionToken?: string; emiScheduleId?: string };
    const session = await resolveCustomerSession(input.customerSessionToken || '');
    if (!session) return publicError('Your customer session expired. Please log in again.', 401, origin);
    if (!/^[0-9a-f-]{36}$/i.test(input.emiScheduleId || '')) return publicError('Select a valid EMI.', 400, origin);

    const { data: settings } = await session.supabase.from('payment_settings').select('razorpay_enabled').eq('id', true).maybeSingle();
    if (!settings?.razorpay_enabled) return publicError('Online payment is not available yet.', 409, origin);

    const { data: emis, error: emiError } = await session.supabase.from('emi_schedule')
      .select('id, application_id, amount, carry_forward_amount, paid_amount, due_date, grace_days, penalty_amount, status')
      .eq('application_id', session.applicationId).order('due_date', { ascending: true });
    if (emiError) throw emiError;
    const schedule = emis || [];
    const selectedIndex = schedule.findIndex((emi) => emi.id === input.emiScheduleId);
    const firstUnsettledIndex = schedule.findIndex((emi) => !['paid', 'part_paid'].includes(emi.status));
    const selectedEmi = selectedIndex >= 0 ? schedule[selectedIndex] : null;
    const indiaMonth = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit'
    }).formatToParts(new Date()).reduce((parts, part) => {
      if (part.type === 'year' || part.type === 'month') parts[part.type] = part.value;
      return parts;
    }, {} as Record<string, string>);
    const currentMonthKey = `${indiaMonth.year}-${indiaMonth.month}`;
    const selectedMonthKey = selectedEmi?.due_date?.slice(0, 7) || '';
    const earlierVerificationPending = selectedIndex > 0
      && schedule.slice(0, selectedIndex).some((emi) => emi.status === 'verification_pending');
    const sequenceOpen = selectedIndex === firstUnsettledIndex || selectedMonthKey <= currentMonthKey;

    if (!selectedEmi || !['pending', 'overdue'].includes(selectedEmi.status) || earlierVerificationPending || !sequenceOpen) {
      return publicError('This EMI is not currently payable.', 409, origin);
    }

    const baseAmount = payableAmount(selectedEmi);
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) throw new Error('Invalid payable amount.');
    const amounts = gatewayAmounts(baseAmount);

    const { data: existing } = await session.supabase.from('razorpay_orders').select('*')
      .eq('emi_schedule_id', selectedEmi.id).in('status', ['created', 'authorized']).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const { keyId, keySecret } = razorpayConfig();
    if (existing?.razorpay_order_id && Number(existing.amount_subunits) === amounts.grossSubunits) {
      return json({ keyId, orderId: existing.razorpay_order_id, amount: amounts.grossSubunits, currency: 'INR' }, 200, origin);
    }

    if (existing?.id) await session.supabase.from('razorpay_orders').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', existing.id);
    const localId = crypto.randomUUID();
    const receipt = `rfg_${localId.replace(/-/g, '').slice(0, 26)}`;
    const { error: ledgerError } = await session.supabase.from('razorpay_orders').insert({
      id: localId, application_id: session.applicationId, emi_schedule_id: selectedEmi.id, receipt,
      base_amount: baseAmount, gross_amount: amounts.gross, amount_subunits: amounts.grossSubunits,
      estimated_fee: amounts.fee, estimated_fee_gst: amounts.feeGst, status: 'creating'
    });
    if (ledgerError) throw ledgerError;

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST', headers: { authorization: basicAuth(keyId, keySecret), 'content-type': 'application/json' },
      body: JSON.stringify({ amount: amounts.grossSubunits, currency: 'INR', receipt, notes: { rfg_order: localId } })
    });
    const order = await response.json();
    if (!response.ok || !order?.id) {
      await session.supabase.from('razorpay_orders').update({ status: 'failed', failure_code: String(order?.error?.code || 'order_failed'), updated_at: new Date().toISOString() }).eq('id', localId);
      throw new Error('Razorpay order creation failed.');
    }
    await session.supabase.from('razorpay_orders').update({ razorpay_order_id: order.id, status: 'created', updated_at: new Date().toISOString() }).eq('id', localId);
    return json({ keyId, orderId: order.id, amount: amounts.grossSubunits, currency: 'INR' }, 200, origin);
  } catch (error) {
    console.error('razorpay-create-order failed', error instanceof Error ? error.message : error);
    return publicError('Online payment could not start. Please try again.', 500, origin);
  }
});
