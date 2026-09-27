export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface SmsSendInput {
  to: string;
  from: string;
  content: string;
  organizationId: string;
  messageId?: string;
  idempotencyKey?: string;
}

export interface SmsSendResult {
  providerMessageId: string;
  segments?: number;
  cost?: number;
  currency?: string;
}

export interface SmsProvider {
  send(input: SmsSendInput): Promise<SmsSendResult>;
  getName(): string;
}
