import nodemailer from 'nodemailer';

// Create transporter from env vars (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)
// Falls back to nodemailer's test account (Ethereal) if no SMTP config provided
let transporter: nodemailer.Transporter | null = null;

async function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Dev mode: use Ethereal test account — logs URL to view email
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('[email] No SMTP configured, using Ethereal test account:', testAccount.user);
  }
  return transporter;
}

export async function sendPasswordResetEmail(to: string, resetToken: string, baseUrl: string) {
  const t = await getTransporter();
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
  const info = await t.sendMail({
    from: process.env.SMTP_FROM || '"Anton by openEXPERT" <noreply@openexpert.ai>',
    to,
    subject: 'Reset your Anton password',
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #0B1426;">Reset your password</h2>
        <p style="color: #555;">Click the button below to reset your password. This link expires in 1 hour.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#2DD4A8;color:#0B1426;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">Reset Password</a>
        <p style="color:#999;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
  if (!process.env.SMTP_HOST) {
    console.log('[email] Preview URL:', nodemailer.getTestMessageUrl(info));
  }
}

export async function sendDeadlineReminderEmail(
  to: string,
  deadline: { title: string; due_date: string; priority: string },
  daysBefore: number
) {
  const t = await getTransporter();
  const dueDate = new Date(deadline.due_date).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const priorityColors: Record<string, string> = {
    critical: '#E74C3C', high: '#F5A623', medium: '#3498DB', low: '#B0B0B0'
  };
  const priorityColor = priorityColors[deadline.priority] || '#3498DB';

  const info = await t.sendMail({
    from: process.env.SMTP_FROM || '"Anton by openEXPERT" <noreply@openexpert.ai>',
    to,
    subject: `Reminder: "${deadline.title}" due in ${daysBefore} day${daysBefore !== 1 ? 's' : ''}`,
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #0B1426;">Deadline Reminder</h2>
        <p style="color: #555;">
          <strong style="color: ${priorityColor};">${deadline.title}</strong> is due in
          <strong>${daysBefore} day${daysBefore !== 1 ? 's' : ''}</strong>.
        </p>
        <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0; color: #333;"><strong>Due date:</strong> ${dueDate}</p>
          <p style="margin: 8px 0 0; color: #333;"><strong>Priority:</strong>
            <span style="color: ${priorityColor}; font-weight: 700;">${deadline.priority.charAt(0).toUpperCase() + deadline.priority.slice(1)}</span>
          </p>
        </div>
        <p style="color:#999;font-size:12px;">This is an automated reminder from Anton by openEXPERT.</p>
      </div>
    `,
  });
  if (!process.env.SMTP_HOST) {
    console.log('[email] Preview URL:', nodemailer.getTestMessageUrl(info));
  }
}

export async function sendProjectInvitationEmail(
  to: string,
  projectName: string,
  inviterName: string,
  role: string,
  acceptUrl: string
) {
  const t = await getTransporter();
  const info = await t.sendMail({
    from: process.env.SMTP_FROM || '"Anton by openEXPERT" <noreply@openexpert.ai>',
    to,
    subject: `You've been invited to project: ${projectName}`,
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #0B1426;">Project Invitation</h2>
        <p style="color: #555;">
          <strong>${inviterName}</strong> has invited you to join the project
          <strong>"${projectName}"</strong> as a <strong>${role}</strong>.
        </p>
        <a href="${acceptUrl}" style="display:inline-block;background:#2DD4A8;color:#0B1426;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">Accept Invitation</a>
        <p style="color:#999;font-size:12px;">This invitation expires in 7 days. If you don't have an account, you'll be prompted to create one.</p>
      </div>
    `,
  });
  if (!process.env.SMTP_HOST) {
    console.log('[email] Preview URL:', nodemailer.getTestMessageUrl(info));
  }
}

export async function sendTaskCompleteEmail(to: string, taskDescription: string, moduleId: string) {
  const t = await getTransporter();
  const info = await t.sendMail({
    from: process.env.SMTP_FROM || '"Anton by openEXPERT" <noreply@openexpert.ai>',
    to,
    subject: `Anton: Your analysis is ready — ${moduleId}`,
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #0B1426;">Your analysis is ready</h2>
        <p style="color: #555;">Anton has finished: <strong>${taskDescription}</strong></p>
        <p style="color: #555;">Log in to view your results.</p>
        <p style="color:#999;font-size:12px;">Module: ${moduleId}</p>
      </div>
    `,
  });
  if (!process.env.SMTP_HOST) {
    console.log('[email] Preview URL:', nodemailer.getTestMessageUrl(info));
  }
}
