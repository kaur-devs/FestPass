import type { EmailSender } from '../../lib/email';

interface Recipient {
  email: string;
  name: string;
}

export class AuthEmails {
  constructor(
    private readonly sender: EmailSender,
    private readonly webOrigin: string,
  ) {}

  sendEmailVerification(to: Recipient, token: string) {
    const url = this.link('/verify-email', token);
    return this.sender.send({
      to: to.email,
      subject: 'Confirm your email for FestPass',
      text: [
        `Hi ${to.name},`,
        'Confirm your email address to finish setting up your FestPass account:',
        url,
        'This link expires in 24 hours. If you did not create an account, you can ignore this email.',
      ].join('\n\n'),
    });
  }

  sendPasswordReset(to: Recipient, token: string) {
    const url = this.link('/reset-password', token);
    return this.sender.send({
      to: to.email,
      subject: 'Reset your FestPass password',
      text: [
        `Hi ${to.name},`,
        'Use this link to choose a new password:',
        url,
        'This link expires in 1 hour and can be used once. If you did not ask to reset your password, you can ignore this email; your password has not changed.',
      ].join('\n\n'),
    });
  }

  private link(path: string, token: string) {
    const url = new URL(path, this.webOrigin);
    url.searchParams.set('token', token);
    return url.toString();
  }
}
