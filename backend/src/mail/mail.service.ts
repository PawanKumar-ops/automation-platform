import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { passwordResetTemplate } from './templates/password-reset.template/password-reset.template';
import { verificationTemplate } from './templates/verification.template/verification.template';

@Injectable()
export class MailService {
  private readonly resend: Resend;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
  }

  async sendVerification(email: string, name: string, code: string): Promise<void> {
    await this.send(email, 'Verify your Taskvyn email', verificationTemplate(name, code));
  }

  async sendPasswordReset(email: string, name: string, code: string): Promise<void> {
    await this.send(email, 'Your Taskvyn password reset code', passwordResetTemplate(name, code));
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('EMAIL_FROM')?.trim();
    if (!apiKey || !from) throw new ServiceUnavailableException('Email delivery is not configured');
    const { error } = await this.resend.emails.send({ from, to, subject, html });
    if (error) throw new ServiceUnavailableException('Email could not be delivered. Please try again later.');
  }
}
