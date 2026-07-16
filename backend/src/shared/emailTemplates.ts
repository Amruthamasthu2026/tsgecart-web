const BRAND = '#FFE60D';

function layout(title: string, body: string): string {
  return `
  <div style="font-family:Inter,Arial,sans-serif;background:#f6f6f6;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #eee">
      <div style="background:${BRAND};padding:20px 24px">
        <span style="font-weight:800;font-size:20px;color:#0A0A0A">TSG eCart</span>
      </div>
      <div style="padding:24px;color:#1A1A1A;line-height:1.6">
        <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
        ${body}
      </div>
      <div style="padding:16px 24px;background:#0A0A0A;color:#999;font-size:12px">
        Fresh Groceries Delivered Fast · Hyderabad
      </div>
    </div>
  </div>`;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:#0A0A0A;color:${BRAND};text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;margin:16px 0">${label}</a>`;
}

export function verifyEmailTemplate(name: string, url: string): { subject: string; html: string; text: string } {
  return {
    subject: 'Verify your TSG eCart email',
    html: layout(
      `Welcome, ${name}!`,
      `<p>Confirm your email address to activate your TSG eCart account.</p>
       ${button(url, 'Verify email')}
       <p style="font-size:13px;color:#6B7280">This link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>`,
    ),
    text: `Welcome to TSG eCart! Verify your email: ${url}`,
  };
}

export function resetPasswordTemplate(name: string, url: string): { subject: string; html: string; text: string } {
  return {
    subject: 'Reset your TSG eCart password',
    html: layout(
      `Password reset`,
      `<p>Hi ${name}, we received a request to reset your password.</p>
       ${button(url, 'Reset password')}
       <p style="font-size:13px;color:#6B7280">This link expires in 1 hour. If you didn't request this, your account is still secure.</p>`,
    ),
    text: `Reset your TSG eCart password: ${url}`,
  };
}
