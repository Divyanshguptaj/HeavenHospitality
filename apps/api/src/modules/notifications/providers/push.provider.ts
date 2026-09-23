import { env } from '../../../config/env.js';

/**
 * Expo push delivery (https://docs.expo.dev/push-notifications/sending-notifications/).
 *
 * Sending is two-phase: `send` returns a ticket per message, and delivery
 * outcome arrives later as a receipt fetched with `getReceipts`.
 */

const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const TIMEOUT_MS = 10_000;

export interface PushMessage {
  readonly to: string;
  readonly title: string;
  readonly body: string;
  readonly data: Record<string, string>;
}

export interface PushTicket {
  readonly ok: boolean;
  readonly ticketId: string | null;
  /** Expo's error code, e.g. "DeviceNotRegistered". */
  readonly error: string | null;
}

export interface PushReceipt {
  readonly ok: boolean;
  readonly error: string | null;
}

export interface PushProvider {
  readonly name: string;
  send(messages: readonly PushMessage[]): Promise<PushTicket[]>;
  getReceipts(ticketIds: readonly string[]): Promise<Map<string, PushReceipt>>;
}

interface ExpoTicketResponse {
  readonly status: 'ok' | 'error';
  readonly id?: string;
  readonly message?: string;
  readonly details?: { readonly error?: string };
}

function headers(): Record<string, string> {
  return {
    'content-type': 'application/json',
    accept: 'application/json',
    ...(env.EXPO_ACCESS_TOKEN === undefined
      ? {}
      : { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` }),
  };
}

export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo';

  async send(messages: readonly PushMessage[]): Promise<PushTicket[]> {
    if (messages.length === 0) return [];

    const failAll = (error: string): PushTicket[] =>
      messages.map(() => ({ ok: false, ticketId: null, error }));

    let response: Response;
    try {
      response = await fetch(SEND_URL, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(
          messages.map((message) => ({
            to: message.to,
            title: message.title,
            body: message.body,
            data: message.data,
            sound: 'default',
            channelId: 'default',
          })),
        ),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return failAll('ExpoUnreachable');
    }

    if (!response.ok) return failAll(`ExpoHttp${response.status}`);

    const body = (await response.json().catch(() => null)) as { data?: ExpoTicketResponse[] } | null;
    const tickets = body?.data;
    if (tickets === undefined || tickets.length !== messages.length) return failAll('ExpoBadResponse');

    return tickets.map((ticket) =>
      ticket.status === 'ok'
        ? { ok: true, ticketId: ticket.id ?? null, error: null }
        : { ok: false, ticketId: null, error: ticket.details?.error ?? ticket.message ?? 'ExpoError' },
    );
  }

  async getReceipts(ticketIds: readonly string[]): Promise<Map<string, PushReceipt>> {
    const result = new Map<string, PushReceipt>();
    if (ticketIds.length === 0) return result;

    const response = await fetch(RECEIPTS_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ ids: ticketIds }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return result;

    const body = (await response.json().catch(() => null)) as {
      data?: Record<string, ExpoTicketResponse>;
    } | null;

    for (const [id, receipt] of Object.entries(body?.data ?? {})) {
      result.set(
        id,
        receipt.status === 'ok'
          ? { ok: true, error: null }
          : { ok: false, error: receipt.details?.error ?? receipt.message ?? 'ExpoError' },
      );
    }
    return result;
  }
}

let cached: PushProvider | null = null;

export function getPushProvider(): PushProvider {
  cached ??= new ExpoPushProvider();
  return cached;
}

export function setPushProviderForTesting(provider: PushProvider | null): void {
  cached = provider;
}
