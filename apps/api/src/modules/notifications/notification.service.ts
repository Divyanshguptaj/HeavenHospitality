import { Prisma } from '@prisma/client';

import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import {
  EVENTS,
  MUTABLE_CATEGORIES,
  type EventParams,
  type NotificationChannelName,
  type NotificationEvent,
} from './events.js';
import { getPushProvider } from './providers/push.provider.js';
import { getWhatsappProvider } from './providers/whatsapp.provider.js';

/**
 * The one entry point application code uses to tell someone something.
 *
 * `notify` NEVER throws: a failed message must not undo the payment, complaint
 * update or room assignment that triggered it. Every attempt is recorded as a
 * `NotificationDelivery` row, unique on (dedupeKey, channel), so a job that
 * re-runs cannot send the same thing twice.
 */

const PRISMA_UNIQUE_VIOLATION = 'P2002';

export interface NotifyInput<E extends NotificationEvent> {
  readonly event: E;
  readonly userId: string;
  /** Logical identity of this message, e.g. an invoice id + date. The event and user are added for you. */
  readonly dedupeKey: string;
  readonly params: EventParams[E];
  /** Narrows the event's default channels (e.g. WhatsApp only on one overdue day). */
  readonly channels?: readonly NotificationChannelName[];
}

/** Reserves the delivery row; false means it already exists and nothing should be sent. */
async function reserve(input: {
  userId: string;
  event: string;
  channel: NotificationChannelName;
  provider: string;
  dedupeKey: string;
}): Promise<string | null> {
  try {
    const row = await prisma.notificationDelivery.create({
      data: { ...input, attempts: 1 },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE_VIOLATION
    ) {
      return null;
    }
    throw error;
  }
}

async function settle(
  id: string,
  outcome: { status: 'SENT' | 'FAILED' | 'SKIPPED'; messageId?: string | null; error?: string },
): Promise<void> {
  const now = new Date();
  await prisma.notificationDelivery.update({
    where: { id },
    data: {
      status: outcome.status,
      providerMessageId: outcome.messageId ?? null,
      lastError: outcome.error?.slice(0, 200) ?? null,
      ...(outcome.status === 'SENT' ? { sentAt: now } : {}),
      ...(outcome.status === 'FAILED' ? { failedAt: now } : {}),
    },
  });
}

async function sendPush(
  deliveryId: string,
  userId: string,
  message: { title: string; body: string; route: string },
): Promise<void> {
  const tokens = await prisma.deviceToken.findMany({
    where: { userId, disabledAt: null },
    select: { id: true, token: true },
  });

  if (tokens.length === 0) {
    await settle(deliveryId, { status: 'SKIPPED', error: 'no registered device' });
    return;
  }

  const tickets = await getPushProvider().send(
    tokens.map((device) => ({
      to: device.token,
      title: message.title,
      body: message.body,
      data: { route: message.route },
    })),
  );

  const dead: string[] = [];
  const accepted: string[] = [];
  let firstError: string | null = null;

  tickets.forEach((ticket, index) => {
    const device = tokens[index];
    if (device === undefined) return;
    if (ticket.ok && ticket.ticketId !== null) {
      accepted.push(`${device.id}:${ticket.ticketId}`);
    } else {
      firstError ??= ticket.error;
      if (ticket.error === 'DeviceNotRegistered') dead.push(device.id);
    }
  });

  if (dead.length > 0) {
    await prisma.deviceToken.updateMany({
      where: { id: { in: dead } },
      data: { disabledAt: new Date() },
    });
  }

  if (accepted.length > 0) {
    await settle(deliveryId, { status: 'SENT', messageId: accepted.join(',') });
  } else {
    await settle(deliveryId, { status: 'FAILED', error: firstError ?? 'push rejected' });
  }
}

async function deliver<E extends NotificationEvent>(input: NotifyInput<E>): Promise<void> {
  const definition = EVENTS[input.event] as (typeof EVENTS)[NotificationEvent];
  const params = input.params as never;

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { phone: true, status: true, mutedNotificationKinds: true },
  });
  if (user === null || user.status !== 'ACTIVE') return;

  if (
    MUTABLE_CATEGORIES.includes(definition.category) &&
    user.mutedNotificationKinds.includes(definition.category)
  ) {
    return;
  }

  const channels = definition.channels.filter(
    (channel) => input.channels === undefined || input.channels.includes(channel),
  );
  const logicalKey = `${input.event}:${input.userId}:${input.dedupeKey}`;
  const message = (definition.render as (p: never) => { title: string; body: string; route: string })(params);

  for (const channel of channels) {
    if (channel === 'PUSH') {
      const id = await reserve({
        userId: input.userId,
        event: input.event,
        channel,
        provider: getPushProvider().name,
        dedupeKey: logicalKey,
      });
      if (id === null) continue;
      try {
        await sendPush(id, input.userId, message);
      } catch (error) {
        await settle(id, { status: 'FAILED', error: error instanceof Error ? error.message : 'push failed' });
      }
      continue;
    }

    const whatsapp = definition.whatsapp as
      | ((p: never) => { template: 'RENT_DUE' | 'RENT_OVERDUE'; variables: readonly string[] })
      | undefined;
    if (whatsapp === undefined) continue;

    const provider = getWhatsappProvider();
    const id = await reserve({
      userId: input.userId,
      event: input.event,
      channel,
      provider: provider.name,
      dedupeKey: logicalKey,
    });
    if (id === null) continue;

    try {
      const spec = whatsapp(params);
      const messageId = await provider.send({
        phone: user.phone,
        template: spec.template,
        variables: spec.variables,
        event: input.event,
      });
      await settle(id, { status: 'SENT', messageId });
    } catch (error) {
      await settle(id, { status: 'FAILED', error: error instanceof Error ? error.message : 'whatsapp failed' });
    }
  }
}

/** Sends one event to one user. Never throws. */
export async function notify<E extends NotificationEvent>(input: NotifyInput<E>): Promise<void> {
  try {
    await deliver(input);
  } catch (error) {
    logger.error({ event: input.event, err: error }, 'notification failed');
  }
}

/** Sends one event to every active admin of a property. Never throws. */
export async function notifyOwners<E extends NotificationEvent>(
  propertyId: string,
  input: Omit<NotifyInput<E>, 'userId'>,
): Promise<void> {
  try {
    const owners = await prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE', memberships: { some: { propertyId } } },
      select: { id: true },
    });
    for (const owner of owners) {
      await notify({ ...input, userId: owner.id });
    }
  } catch (error) {
    logger.error({ event: input.event, err: error }, 'owner notification failed');
  }
}

/** Sends one event to every active resident of a property. Never throws. */
export async function notifyResidents<E extends NotificationEvent>(
  propertyId: string,
  input: Omit<NotifyInput<E>, 'userId'>,
): Promise<void> {
  try {
    const tenancies = await prisma.tenancy.findMany({
      where: { propertyId, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } },
      select: { userId: true },
    });
    for (const tenancy of tenancies) {
      await notify({ ...input, userId: tenancy.userId });
    }
  } catch (error) {
    logger.error({ event: input.event, err: error }, 'resident notification failed');
  }
}

/**
 * Turns push tickets into delivery outcomes and disables dead device tokens.
 * Expo only reports final delivery through receipts, fetched some minutes after sending.
 */
export async function reconcilePushReceipts(): Promise<string> {
  const pending = await prisma.notificationDelivery.findMany({
    where: {
      channel: 'PUSH',
      status: 'SENT',
      providerMessageId: { not: null },
      sentAt: { lt: new Date(Date.now() - 15 * 60_000) },
    },
    take: 300,
    select: { id: true, providerMessageId: true },
  });
  if (pending.length === 0) return 'No push receipts to reconcile';

  const pairs = pending.flatMap((row) =>
    (row.providerMessageId ?? '').split(',').map((pair) => {
      const [tokenId, ticketId] = pair.split(':');
      return { deliveryId: row.id, tokenId: tokenId ?? '', ticketId: ticketId ?? '' };
    }),
  );

  const receipts = await getPushProvider().getReceipts(pairs.map((pair) => pair.ticketId));

  const deadTokens = new Set<string>();
  const outcome = new Map<string, { failed: boolean; error: string | null }>();

  for (const pair of pairs) {
    const receipt = receipts.get(pair.ticketId);
    if (receipt === undefined) continue;
    if (!receipt.ok && receipt.error === 'DeviceNotRegistered') deadTokens.add(pair.tokenId);
    const current = outcome.get(pair.deliveryId) ?? { failed: true, error: receipt.error };
    // A delivery counts as delivered if ANY of the user's devices received it.
    outcome.set(pair.deliveryId, {
      failed: current.failed && !receipt.ok,
      error: current.error ?? receipt.error,
    });
  }

  if (deadTokens.size > 0) {
    await prisma.deviceToken.updateMany({
      where: { id: { in: [...deadTokens] } },
      data: { disabledAt: new Date() },
    });
  }

  const now = new Date();
  for (const [deliveryId, result] of outcome) {
    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: result.failed
        ? { status: 'FAILED', failedAt: now, lastError: result.error?.slice(0, 200) ?? null }
        : { status: 'DELIVERED', deliveredAt: now },
    });
  }

  return `Reconciled ${outcome.size} push receipt(s), disabled ${deadTokens.size} dead token(s)`;
}
