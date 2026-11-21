import { env } from '../../env.js';
export { createEmailActionToken, hashEmailActionToken } from './email-token.js';

export type EmailActionPurpose = 'email_verification' | 'password_reset';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

export async function sendAccountActionEmail(input: {
  to: string;
  fullName: string;
  purpose: EmailActionPurpose;
  token: string;
}) {
  const url = new URL('/', env.WEB_ORIGIN);
  url.searchParams.set(input.purpose === 'email_verification' ? 'verifyEmail' : 'resetPassword', input.token);
  const action = input.purpose === 'email_verification' ? 'Verify your email address' : 'Reset your PrivaOps password';
  const safeName = escapeHtml(input.fullName);
  const safeUrl = escapeHtml(url.toString());
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#24372b"><h2>${action}</h2><p>Hello ${safeName},</p><p>${input.purpose === 'email_verification' ? 'Confirm this email address to activate your PrivaOps sign-in.' : 'A password reset was requested for your account. If you did not request this, you can ignore this email.'}</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#176b48;color:#fff;text-decoration:none;border-radius:6px">${action}</a></p><p>This link expires in 30 minutes and can be used once.</p><p>If the button does not work, open this link:</p><p>${safeUrl}</p></div>`;
  const subject = input.purpose === 'email_verification' ? 'Verify your PrivaOps email' : 'Reset your PrivaOps password';

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    if (env.NODE_ENV === 'production') throw new Error('Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM before enabling account email workflows.');
    console.info(`[development email] ${subject} for ${input.to}: ${url.toString()}`);
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [input.to], subject, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Email provider rejected the message (${response.status}): ${detail.slice(0, 300)}`);
  }
}
