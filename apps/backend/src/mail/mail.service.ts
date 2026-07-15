import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const port = this.config.get<number>('SMTP_PORT') || 587;
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const secure =
      this.config.get<string>('SMTP_SECURE') === 'true' || port === 465;

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP_HOST, SMTP_USER or SMTP_PASS missing — email sending disabled',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      // OVH mail servers use a self-signed cert on some endpoints; keep the
      // default TLS verification enabled in production and only relax in dev.
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
    });
  }

  async send(options: SendMailOptions): Promise<{ messageId?: string }> {
    if (!this.transporter) {
      this.logger.warn('Cannot send mail — transporter not configured');
      return {};
    }

    const from = this.config.get<string>(
      'SMTP_FROM',
      this.config.get<string>('SMTP_USER', ''),
    );

    const mailOptions: Mail.Options = {
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    const info = (await this.transporter.sendMail(mailOptions)) as {
      messageId?: string;
    };
    this.logger.log(`Email sent to ${options.to}: ${info.messageId}`);
    return { messageId: info.messageId };
  }

  isConfigured(): boolean {
    return Boolean(this.transporter);
  }
}
