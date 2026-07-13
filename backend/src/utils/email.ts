import { Resend } from 'resend';
import { config } from '../config';

const resend = new Resend(config.resend.apiKey);

/**
 * Sends a password reset email via Resend.
 * Mirrors the pmp-backend EmailService implementation.
 */
export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: email,
    subject: 'Reset your password',
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2>Password Reset Request</h2>

        <p>Hello,</p>

        <p>We received a request to reset your password. Click the button below to create a new password.</p>

        <p style="margin: 30px 0;">
          <a
            href="${resetUrl}"
            style="
              background:#2563eb;
              color:#ffffff;
              padding:12px 24px;
              text-decoration:none;
              border-radius:6px;
              display:inline-block;
            "
          >
            Reset Password
          </a>
        </p>

        <p>This link is valid for <strong>1 hour</strong>.</p>

        <p>If you didn't request a password reset, you can safely ignore this email.</p>

        <hr>

        <p style="font-size:12px;color:#777;">
          This is an automated email. Please do not reply.
        </p>
      </div>
    `,
  });
}
