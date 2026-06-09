import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const FROM     = 'VetOS HR <onboarding@vetclinic.com>';

export interface CredentialsEmailOptions {
  fullName:     string;
  email:        string;
  password:     string;
  role:         string;
  hospitalName: string;
  senderName:   string;
}

export async function sendCredentialsEmail(
  to: string,
  opts: CredentialsEmailOptions,
): Promise<{ success: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY ?? '';
  if (!key || key === 're_...' || key.length < 10) {
    return { success: false, error: 'Email service not configured — add RESEND_API_KEY to .env.local' };
  }

  const { error } = await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: `Welcome to VetOS — Your login credentials`,
    html:    buildCredentialsHtml(opts),
  });

  if (error) return { success: false, error: (error as { message?: string }).message ?? 'Send failed' };
  return { success: true };
}

function buildCredentialsHtml(opts: CredentialsEmailOptions): string {
  const { fullName, email, password, role, hospitalName, senderName } = opts;
  const loginUrl = `${APP_URL}/login`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to VetOS</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:36px 40px;text-align:center;">
            <div style="display:inline-flex;align-items:center;gap:10px;">
              <div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:8px 14px;">
                <span style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.5px;">VetOS</span>
              </div>
            </div>
            <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:10px 0 0;">AI Operating System — Veterinary Practice Management</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Welcome, ${fullName}! 👋</h2>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
              Your VetOS account has been created by <strong>${senderName}</strong> at <strong>${hospitalName}</strong>.
              You've been assigned the role of <strong>${role}</strong>.
            </p>

            <!-- Onboarding notice -->
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
              <p style="margin:0;font-size:13px;color:#1d4ed8;font-weight:600;">📋 Onboarding required before full access</p>
              <p style="margin:6px 0 0;font-size:13px;color:#3b82f6;line-height:1.5;">
                After logging in, you'll be guided through your onboarding process. Your full dashboard becomes available once onboarding is complete.
              </p>
            </div>

            <!-- Credentials box -->
            <div style="background:#0f172a;border-radius:12px;padding:24px;margin-bottom:24px;">
              <p style="margin:0 0 16px;font-size:11px;font-weight:700;color:#34d399;text-transform:uppercase;letter-spacing:1px;">🔐 Your Login Credentials</p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-bottom:12px;">
                    <p style="margin:0 0 4px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Email / Username</p>
                    <div style="background:#1e293b;border-radius:8px;padding:10px 14px;font-size:14px;font-family:monospace;color:#f1f5f9;">${email}</div>
                  </td>
                </tr>
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Temporary Password</p>
                    <div style="background:#1e293b;border-radius:8px;padding:10px 14px;font-size:14px;font-family:monospace;color:#fbbf24;">${password}</div>
                  </td>
                </tr>
              </table>
            </div>

            <!-- CTA -->
            <div style="text-align:center;margin-bottom:24px;">
              <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;">
                Log In to VetOS →
              </a>
              <p style="margin:10px 0 0;font-size:12px;color:#9ca3af;">${loginUrl}</p>
            </div>

            <!-- Security note -->
            <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;">
              <p style="margin:0;font-size:12px;color:#92400e;">
                <strong>⚠️ Security:</strong> This is a temporary password. You will be prompted to change it after your first login. Never share your credentials with anyone.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              This email was sent by VetOS on behalf of ${hospitalName}.<br>
              If you weren't expecting this, please contact your HR department immediately.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
