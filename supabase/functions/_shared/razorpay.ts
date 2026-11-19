import { allowedOrigin, corsHeaders, json, serviceClient } from './admin-device.ts';

export { allowedOrigin, corsHeaders, json, serviceClient };

export const razorpayConfig = () => {
  const keyId = Deno.env.get('RAZORPAY_KEY_ID')?.trim();
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')?.trim();
  if (!keyId || !keySecret) throw new Error('Razorpay is not configured.');
  return { keyId, keySecret };
};

export const basicAuth = (keyId: string, keySecret: string) => `Basic ${btoa(`${keyId}:${keySecret}`)}`;

export const hmacHex = async (secret: string, value: string) => {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
};

export const resolveCustomerSession = async (token: string) => {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const supabase = serviceClient();
  const { data, error } = await supabase.rpc('service_resolve_customer_payment_session', { p_token: token });
  if (error) throw error;
  return data ? { supabase, applicationId: String(data) } : null;
};

export const gatewayAmounts = (baseAmount: number) => {
  // The customer covers Razorpay's 2% fee. RFG absorbs the 18% GST on that fee.
  const grossSubunits = Math.ceil((baseAmount * 100) / (1 - 0.02));
  const gross = grossSubunits / 100;
  const fee = Math.round(gross * 0.02 * 100) / 100;
  const feeGst = Math.round(fee * 0.18 * 100) / 100;
  return { grossSubunits, gross, fee, feeGst };
};

export const payableAmount = (emi: Record<string, unknown>) => {
  const amount = Number(emi.amount || 0);
  const carry = Number(emi.carry_forward_amount || 0);
  const dueDate = typeof emi.due_date === 'string' ? new Date(`${emi.due_date}T00:00:00Z`) : null;
  const graceDays = Number(emi.grace_days ?? 7);
  const graceEnd = dueDate ? new Date(dueDate.getTime() + graceDays * 86400000) : null;
  const penalty = graceEnd && Date.now() > graceEnd.getTime() ? Number(emi.penalty_amount ?? 496) : 0;
  return Math.round((amount + carry + penalty) * 100) / 100;
};

export const publicError = (message: string, status: number, origin?: string) => json({ error: message }, status, origin);
