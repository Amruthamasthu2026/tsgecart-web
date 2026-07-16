import nodemailer, { type Transporter } from 'nodemailer';
import { env, isTest } from './env.js';
import { logger } from './logger.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Sends an email. In test mode (or when SMTP is unconfigured) it logs instead
 * of sending, so flows remain runnable without a live mail server.
 */
export async function sendMail(options: MailOptions): Promise<void> {
  if (isTest || !env.SMTP_HOST) {
    logger.info({ to: options.to, subject: options.subject }, '[mailer] (skipped — no SMTP configured)');
    return;
  }
  await getTransporter().sendMail({
    from: env.MAIL_FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
  logger.info({ to: options.to, subject: options.subject }, 'Email sent');
}
