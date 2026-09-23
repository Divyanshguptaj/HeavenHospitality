import { env } from '../../../config/env.js';
import { AppError } from '../../../errors/AppError.js';

/**
 * The only file that knows Fast2SMS's HTTP details.
 *
 * Both endpoints are GET requests authenticated by an `authorization` header,
 * with the recipient, template and pipe-separated variables in the query string
 * (https://docs.fast2sms.com/reference/dlt-sms and .../sendwhatsappmessage).
 */

const BASE_URL = 'https://www.fast2sms.com/dev';
const TIMEOUT_MS = 10_000;

/** Fast2SMS wants the bare 10-digit number, not E.164. */
export function toFast2smsNumber(e164: string): string {
  return e164.replace(/^\+91/, '');
}

/** The pipe is the variable separator, so it cannot appear inside a value. */
function joinVariables(variables: readonly string[]): string {
  return variables.map((value) => value.replace(/\|/g, ' ').trim()).join('|');
}

interface Fast2smsResponse {
  readonly return?: boolean;
  readonly status?: boolean;
  readonly request_id?: string;
  readonly message?: string | string[];
}

async function get(path: string, params: Record<string, string>): Promise<string> {
  const apiKey = env.FAST2SMS_API_KEY;
  if (apiKey === undefined) {
    throw new AppError('PROVIDER_UNAVAILABLE', 'Message delivery is not configured.');
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}?${new URLSearchParams(params).toString()}`, {
      headers: { authorization: apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AppError('PROVIDER_UNAVAILABLE', 'Message delivery failed: provider unreachable.');
  }

  let body: Fast2smsResponse = {};
  try {
    body = (await response.json()) as Fast2smsResponse;
  } catch {
    // Non-JSON error page; handled by the status check below.
  }

  const accepted = response.ok && (body.return === true || body.status === true);
  if (!accepted) {
    const reason = Array.isArray(body.message) ? body.message.join('; ') : (body.message ?? '');
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      `Message delivery failed (${response.status}) ${reason}`.trim().slice(0, 200),
    );
  }

  return body.request_id ?? '';
}

/** Sends one approved DLT template SMS. Returns Fast2SMS's request id. */
export function sendDltSms(params: {
  phone: string;
  senderId: string;
  templateId: string;
  variables: readonly string[];
}): Promise<string> {
  return get('/bulkV2', {
    route: 'dlt',
    sender_id: params.senderId,
    message: params.templateId,
    variables_values: joinVariables(params.variables),
    numbers: toFast2smsNumber(params.phone),
  });
}

/** Sends one approved WhatsApp template. Returns Fast2SMS's request id. */
export function sendWhatsappTemplate(params: {
  phone: string;
  phoneNumberId: string;
  messageId: string;
  variables: readonly string[];
}): Promise<string> {
  return get('/whatsapp', {
    message_id: params.messageId,
    phone_number_id: params.phoneNumberId,
    numbers: toFast2smsNumber(params.phone),
    variables_values: joinVariables(params.variables),
  });
}
