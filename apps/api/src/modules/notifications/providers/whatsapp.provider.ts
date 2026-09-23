import { env, isProduction } from '../../../config/env.js';
import { AppError } from '../../../errors/AppError.js';
import { logger } from '../../../lib/logger.js';
import type { WhatsappTemplate } from '../events.js';
import { sendWhatsappTemplate } from './fast2sms.client.js';

/**
 * WhatsApp delivery. Application code names a template and its variables and
 * never sees a vendor.
 */
export interface WhatsappProvider {
  readonly name: string;
  /** Resolves to the provider's message/request id, or null when there is none. */
  send(params: {
    phone: string;
    template: WhatsappTemplate;
    variables: readonly string[];
    event: string;
  }): Promise<string | null>;
}

/** Development: logs the event and the masked number only — no variables, no cost. */
export class MockWhatsappProvider implements WhatsappProvider {
  readonly name = 'mock';

  constructor() {
    if (isProduction) {
      throw new Error('MockWhatsappProvider must never be used in production.');
    }
  }

  send(params: { phone: string; template: WhatsappTemplate; event: string }): Promise<string | null> {
    logger.info(
      { to: `${params.phone.slice(0, 5)}*****${params.phone.slice(-2)}`, event: params.event, template: params.template },
      '[MOCK WHATSAPP] not sent',
    );
    return Promise.resolve(null);
  }
}

export class Fast2smsWhatsappProvider implements WhatsappProvider {
  readonly name = 'fast2sms';

  async send(params: {
    phone: string;
    template: WhatsappTemplate;
    variables: readonly string[];
  }): Promise<string | null> {
    const phoneNumberId = env.FAST2SMS_WHATSAPP_PHONE_NUMBER_ID;
    const messageId =
      params.template === 'RENT_DUE'
        ? env.FAST2SMS_WA_RENT_DUE_MESSAGE_ID
        : env.FAST2SMS_WA_RENT_OVERDUE_MESSAGE_ID;

    if (phoneNumberId === undefined || messageId === undefined) {
      throw new AppError('PROVIDER_UNAVAILABLE', 'WhatsApp delivery is not configured.');
    }

    const requestId = await sendWhatsappTemplate({
      phone: params.phone,
      phoneNumberId,
      messageId,
      variables: params.variables,
    });
    return requestId === '' ? null : requestId;
  }
}

let cached: WhatsappProvider | null = null;

export function getWhatsappProvider(): WhatsappProvider {
  cached ??=
    env.MESSAGING_PROVIDER === 'fast2sms' ? new Fast2smsWhatsappProvider() : new MockWhatsappProvider();
  return cached;
}

export function setWhatsappProviderForTesting(provider: WhatsappProvider | null): void {
  cached = provider;
}
