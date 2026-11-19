import {
  allowedOrigin, basicAuth, constantTimeEqual, corsHeaders, hmacHex, json, publicError,
  razorpayConfig, resolveCustomerSession
} from '../_shared/razorpay.ts';

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (request.method === 'OPTIONS') return origin ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 });
  if (!origin) return publicError('Origin not allowed.', 403);
  if (request.method !== 'POST') return publicError('POST required.', 405, origin);

  try {
    const input = await request.json().catch(() => ({})) as {
      customerSessionToken?: string;
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    };
    const session = await resolveCustomerSession(input.customerSessionToken || '');
    if (!session) return publicError('Your customer session expired. Please log in again.', 401, origin);
    if (![input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature].every((value) => typeof value === 'string' && value.length > 5)) {
      return publicError('Incomplete payment confirmation.', 400, origin);
    }

    const { data: ledger, error: ledgerError } = await session.supabase.from('razorpay_orders').select('*')
      .eq('application_id', session.applicationId).eq('razorpay_order_id', input.razorpay_order_id).maybeSingle();
    if (ledgerError || !ledger) return publicError('Payment order was not found.', 404, origin);

    const { keyId, keySecret } = razorpayConfig();
    const expected = await hmacHex(keySecret, `${ledger.razorpay_order_id}|${input.razorpay_payment_id}`);
    if (!constantTimeEqual(expected, input.razorpay_signature!)) return publicError('Payment verification failed.', 400, origin);

    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(input.razorpay_payment_id!)}`, {
      headers: { authorization: basicAuth(keyId, keySecret) }
    });
    const payment = await paymentResponse.json();
    if (!paymentResponse.ok || payment.order_id !== ledger.razorpay_order_id || Number(payment.amount) !== Number(ledger.amount_subunits)) {
      return publicError('Payment details did not match the order.', 409, origin);
    }
    if (payment.status !== 'captured') return publicError('Payment is awaiting confirmation. It will update automatically.', 202, origin);

    const { data, error } = await session.supabase.rpc('service_finalize_razorpay_payment', {
      p_razorpay_order_id: ledger.razorpay_order_id,
      p_razorpay_payment_id: input.razorpay_payment_id,
      p_amount_subunits: Number(payment.amount)
    });
    if (error) throw error;
    return json({ ok: true, result: data }, 200, origin);
  } catch (error) {
    console.error('razorpay-verify-payment failed', error instanceof Error ? error.message : error);
    return publicError('Payment confirmation could not finish. It will be checked automatically.', 500, origin);
  }
});
