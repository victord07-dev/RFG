import { allowedOrigin } from './admin-device.ts';

export const staffRedirectUrl = (request: Request) => {
  const origin = allowedOrigin(request);
  if (!origin) throw new Error('Origin not allowed.');
  const url = new URL(origin);
  url.searchParams.set('auth', 'set-password');
  return url.toString();
};

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export const sendStaffAuthEmail = async ({
  to,
  name,
  actionLink,
  kind
}: {
  to: string;
  name: string;
  actionLink: string;
  kind: 'invite' | 'recovery';
}) => {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('ADMIN_OTP_FROM_EMAIL');
  if (!resendKey || !fromEmail) throw new Error('Staff email provider is not configured.');

  const invited = kind === 'invite';
  const title = invited ? 'Set up your RFG Sales account' : 'Reset your RFG staff password';
  const intro = invited
    ? 'An RFG administrator created a Sales account for you.'
    : 'A password reset was requested for your RFG staff account.';
  const button = invited ? 'Create my password' : 'Choose a new password';
  const safeName = escapeHtml(name || 'RFG staff member');
  const safeLink = escapeHtml(actionLink);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject: title,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#082b28"><h2>${title}</h2><p>Hello ${safeName},</p><p>${intro}</p><p><a href="${safeLink}" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#087858;color:#fff;text-decoration:none;font-weight:700">${button}</a></p><p>This secure link is single-use. If you did not expect this email, do not open the link and contact RFG.</p><p style="color:#60736e">RFG Financial security</p></div>`
    })
  });
  if (!response.ok) throw new Error('Staff account email could not be sent.');
};

export const normalizeStaffEmail = (value: unknown) => String(value || '').trim().toLowerCase();
export const validStaffEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
export const validStaffName = (value: string) => value.trim().length >= 2 && value.trim().length <= 100;
