// Dùng chung cho mọi Edge Function.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

// Domain email của trường. MSHS chính là phần trước @.
export const STUDENT_EMAIL_DOMAIN = Deno.env.get('STUDENT_EMAIL_DOMAIN') ?? 'lsts.edu.vn'
export const studentEmail = (mshs: string) => `${String(mshs).trim()}@${STUDENT_EMAIL_DOMAIN}`

// Luật mật khẩu học sinh — bản gốc ở đây, frontend chỉ lặp lại để hiển thị.
export function validStudentPassword(password: string, mshs: string) {
  return password.length >= 10
    && password.length <= 64
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password)
    && !/\s/.test(password)
    && !password.includes(mshs)
}

export const PASSWORD_RULE_MESSAGE =
  'Mật khẩu cần tối thiểu 10 ký tự, có chữ hoa, chữ thường, số; không có khoảng trắng và không chứa MSHS.'

export const normalizeName = (value: string) =>
  value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN')

// ---------- Gửi email ----------
// Domain của trường nằm trên Microsoft 365, nên ưu tiên Microsoft Graph:
// nhiều tenant M365 đã tắt SMTP AUTH (Basic Auth) nên đường SMTP hay hỏng.
//
// Đặt secret cho project theo MỘT trong ba cách:
//   1) Microsoft Graph — khuyến nghị cho @lsts.edu.vn
//      MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, EMAIL_FROM
//      (App registration + quyền ứng dụng Mail.Send, đã admin-consent)
//   2) SMTP Exchange Online — cần quản trị bật SMTP AUTH cho hộp thư gửi
//      SMTP_HOST=smtp.office365.com, SMTP_PORT=587, SMTP_USER, SMTP_PASS, EMAIL_FROM
//   3) Resend — SMTP_* để trống, đặt RESEND_API_KEY + EMAIL_FROM
//
// Chưa đặt gì thì trả về {skipped:true} và KHÔNG làm hỏng luồng chính.
export type MailResult = { ok: boolean; skipped?: boolean; error?: string }

async function graphToken(tenant: string, clientId: string, secret: string) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: secret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!r.ok) throw new Error(`Graph token ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return (await r.json()).access_token as string
}

export async function sendEmail(to: string | string[], subject: string, html: string): Promise<MailResult> {
  const from = Deno.env.get('EMAIL_FROM')
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (!from || recipients.length === 0) return { ok: false, skipped: true }

  const tenant = Deno.env.get('MS_TENANT_ID')
  const clientId = Deno.env.get('MS_CLIENT_ID')
  const clientSecret = Deno.env.get('MS_CLIENT_SECRET')
  if (tenant && clientId && clientSecret) {
    try {
      const token = await graphToken(tenant, clientId, clientSecret)
      // Người nhận là học sinh/giáo viên cùng lớp — để BCC cho khỏi lộ danh sách.
      const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: 'HTML', content: html },
            toRecipients: recipients.length === 1 ? [{ emailAddress: { address: recipients[0] } }] : [{ emailAddress: { address: from } }],
            bccRecipients: recipients.length === 1 ? [] : recipients.map((a) => ({ emailAddress: { address: a } })),
          },
          saveToSentItems: false,
        }),
      })
      if (!r.ok) return { ok: false, error: `Graph sendMail ${r.status}: ${(await r.text()).slice(0, 200)}` }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  }

  const smtpHost = Deno.env.get('SMTP_HOST')
  if (smtpHost) {
    try {
      const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts')
      const port = Number(Deno.env.get('SMTP_PORT') ?? 587)
      // Exchange Online dùng 587 + STARTTLS: đặt tls=false để denomailer tự nâng cấp.
      const implicitTls = (Deno.env.get('SMTP_TLS') ?? (port === 465 ? 'true' : 'false')) === 'true'
      const client = new SMTPClient({
        connection: {
          hostname: smtpHost,
          port,
          tls: implicitTls,
          auth: { username: Deno.env.get('SMTP_USER')!, password: Deno.env.get('SMTP_PASS')! },
        },
      })
      await client.send({ from, to: recipients, subject, html })
      await client.close()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (resendKey) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: recipients, subject, html }),
      })
      if (!r.ok) return { ok: false, error: `Resend ${r.status}: ${(await r.text()).slice(0, 200)}` }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  }

  return { ok: false, skipped: true }
}

export function emailLayout(title: string, body: string) {
  return `<!doctype html><html lang="vi"><body style="margin:0;background:#f4f6f5;padding:24px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1c2b25">
  <table role="presentation" style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8e5">
    <tr><td style="background:#12372A;padding:18px 24px;color:#fff">
      <div style="font-weight:700;font-size:16px">Self-Study</div>
      <div style="font-size:12px;opacity:.75">Plan · Do · Reflect</div>
    </td></tr>
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 12px;font-size:18px">${title}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:14px 24px;background:#f7faf8;font-size:12px;color:#6b7c74">
      Email tự động từ hệ thống quản lý giờ tự học. Vui lòng không trả lời email này.
    </td></tr>
  </table></body></html>`
}
