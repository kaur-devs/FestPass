import type { Logger } from 'pino';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  attachments?: EmailAttachment[];
}

export interface EmailSender {
  send(message: EmailMessage, idempotencyKey?: string): Promise<void>;
}

export class LogEmailSender implements EmailSender {
  constructor(private readonly logger: Logger) {}

  send(message: EmailMessage): Promise<void> {
    this.logger.info(
      {
        email: {
          to: message.to,
          subject: message.subject,
          text: message.text,
          attachments: message.attachments?.map((a) => `${a.filename} (${a.content.length} bytes)`),
        },
      },
      'Email not delivered: no provider configured',
    );
    return Promise.resolve();
  }
}

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage, idempotencyKey?: string): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        attachments: message.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content.toString('base64'),
        })),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  }
}
