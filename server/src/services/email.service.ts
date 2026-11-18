import { resolveMx } from 'dns/promises';
import { domainToASCII } from 'url';
import { AppError, AppErrorCode } from '../utils/app-error';

const BREVO_EMAIL_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
export const INVALID_EMAIL_DOMAIN_MESSAGE = 'This email domain cannot receive emails. Please check your address.';

export class BrevoRecipientRejectedError extends Error {
  constructor() {
    super('Brevo rejected the recipient address');
    this.name = 'BrevoRecipientRejectedError';
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] as string);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export class EmailService {
  static assertConfigured(): void {
    requiredEnv('BREVO_API_KEY');
    requiredEnv('BREVO_SENDER_EMAIL');
    requiredEnv('BREVO_SENDER_NAME');
  }

  static async assertEmailDomainHasMx(toEmail: string): Promise<void> {
    const atIndex = toEmail.lastIndexOf('@');
    const rawDomain = atIndex > 0 ? toEmail.slice(atIndex + 1).trim().replace(/\.$/, '') : '';
    let domain = '';
    try {
      domain = domainToASCII(rawDomain);
    } catch {
      throw new AppError(AppErrorCode.BAD_REQUEST, INVALID_EMAIL_DOMAIN_MESSAGE, 400);
    }
    if (!domain || domain.includes('..') || domain.startsWith('-') || domain.endsWith('-')) {
      throw new AppError(AppErrorCode.BAD_REQUEST, INVALID_EMAIL_DOMAIN_MESSAGE, 400);
    }

    let records;
    try {
      records = await resolveMx(domain);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (['ENODATA', 'ENOTFOUND', 'NXDOMAIN', 'NODATA', 'EBADNAME', 'EINVAL'].includes(code || '')) {
        throw new AppError(AppErrorCode.BAD_REQUEST, INVALID_EMAIL_DOMAIN_MESSAGE, 400);
      }
      throw new AppError(AppErrorCode.INTERNAL_SERVER_ERROR, 'We could not verify this email domain right now. Please try again.', 503);
    }

    const hasMailExchange = records.some((record) =>
      Number.isFinite(record.priority) && record.priority >= 0 && Boolean(record.exchange?.trim()) && record.exchange !== '.',
    );
    if (!hasMailExchange) throw new AppError(AppErrorCode.BAD_REQUEST, INVALID_EMAIL_DOMAIN_MESSAGE, 400);
  }

  static async sendVerificationOtpEmail(
    toEmail: string,
    fullName: string,
    businessName: string,
    role: string,
    otp: string,
  ): Promise<void> {
    const apiKey = requiredEnv('BREVO_API_KEY');
    const senderEmail = requiredEnv('BREVO_SENDER_EMAIL');
    const senderName = requiredEnv('BREVO_SENDER_NAME');
    const recipientName = escapeHtml(fullName);
    const business = escapeHtml(businessName);
    const businessRole = escapeHtml(role);
    const code = escapeHtml(otp);
    const htmlContent = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden">
      <div style="background:#1d4ed8;padding:24px 30px;color:#fff">
        <div style="font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase">SharVin B2B</div>
        <h1 style="font-size:24px;line-height:1.3;margin:12px 0 0">Verify your email</h1>
      </div>
      <div style="padding:30px">
        <p style="font-size:16px;line-height:1.6;margin:0 0 12px">Hello ${recipientName},</p>
        <p style="font-size:15px;line-height:1.7;color:#475569;margin:0">Use this code to verify your ${businessRole} account for <strong>${business}</strong>.</p>
        <div style="margin:26px 0;padding:18px;text-align:center;background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px">
          <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#1e40af;text-transform:uppercase">Your verification code</div>
          <div style="font-size:36px;font-weight:800;letter-spacing:10px;color:#0f172a;margin:10px 0 4px">${code}</div>
        </div>
        <p style="font-size:14px;line-height:1.6;color:#475569;margin:0">This code expires in <strong>10 minutes</strong>. If you didn't create a SharVin account, you can ignore this email.</p>
      </div>
      <div style="padding:16px 30px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px">SharVin · Connected B2B Commerce</div>
    </div>
  </div>
</body></html>`;

    const response = await fetch(BREVO_EMAIL_ENDPOINT, {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail, name: fullName }],
        subject: 'Your SharVin email verification code',
        htmlContent,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { code?: string; message?: string; [key: string]: unknown } | null;
      const providerMessage = JSON.stringify(payload || '').toLowerCase();
      const recipientRejected = response.status === 400 && (
        /recipient|email address|email.*invalid|invalid.*email|not a valid email|valid email address/.test(providerMessage)
      );
      if (recipientRejected) throw new BrevoRecipientRejectedError();
      // Avoid returning Brevo response details or recipient data to clients.
      throw new Error(`Brevo email delivery failed with status ${response.status}`);
    }
  }
}
