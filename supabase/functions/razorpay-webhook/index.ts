import { constantTimeEqual, hmacHex, json, serviceClient } from '../_shared/razorpay.ts';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'POST required.' }, 405);
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') || '';
  const eventId = request.headers.get('x-razorpay-event-id') || '';
  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || '';
  if (!secret || !signature || !eventId) return json({ error: 'Unauthorized.' }, 401);

  try {
    const expected = await hmacHex(secret, rawBody);
    if (!constantTimeEqual(expected, signature)) return json({ error: 'Unauthorized.' }, 401);
    const payload = JSON.parse(rawBody) as Record<string, any>;
    const supabase = serviceClient();
    const { error: eventError } = await supabase.from('razorpay_webhook_events').insert({ event_id: eventId, event_type: String(payload.event || 'unknown') });
    if (eventError?.code === '23505') return json({ ok: true, duplicate: true });
    if (eventError) throw eventError;

    const payment = payload?.payload?.payment?.entity;
    if (payload.event === 'payment.captured' && payment?.id && payment?.order_id) {
      const { error } = await supabase.rpc('service_finalize_razorpay_payment', {
        p_razorpay_order_id: payment.order_id,
        p_razorpay_payment_id: payment.id,
        p_amount_subunits: Number(payment.amount)
      });
      if (error) throw error;
    } else if (payload.event === 'payment.failed' && payment?.order_id) {
      await supabase.from('razorpay_orders').update({ status: 'failed', failure_code: String(payment.error_code || 'payment_failed'), updated_at: new Date().toISOString() })
        .eq('razorpay_order_id', payment.order_id).neq('status', 'captured');
    }

    await supabase.from('razorpay_webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', eventId);
    return json({ ok: true });
  } catch (error) {
    console.error('razorpay-webhook failed', error instanceof Error ? error.message : error);
    return json({ error: 'Webhook processing failed.' }, 500);
  }
});
