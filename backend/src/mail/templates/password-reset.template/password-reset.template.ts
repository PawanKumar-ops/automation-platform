export function passwordResetTemplate(name: string, code: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:40px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border-radius:18px;padding:40px"><tr><td><p style="font-size:13px;font-weight:bold;letter-spacing:2px;color:#71717a">TASKVYN</p><h1 style="font-size:26px;margin:24px 0 12px">Reset your password</h1><p style="font-size:15px;line-height:1.6;color:#52525b">Hi ${escapeHtml(name)}, enter this code in Taskvyn to choose a new password:</p><p style="font-size:34px;font-weight:bold;letter-spacing:10px;background:#f4f4f5;padding:20px;border-radius:12px;text-align:center">${code}</p><p style="font-size:14px;line-height:1.6;color:#71717a">This code expires in 10 minutes. If you didn't request a password reset, secure your account by changing your password.</p></td></tr></table></td></tr></table></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
