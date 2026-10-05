import { formatINR } from '@heaven/money';

/**
 * Every message the system can send, in one place: who it is for, which
 * channels carry it, whether the recipient may mute it, and its wording.
 *
 * Every message is delivered as an Expo push notification.
 */

export type NotificationChannelName = 'PUSH';

/** Muting is per category. Financial, stay and security messages cannot be muted. */
export type NotificationCategory = 'FINANCIAL' | 'STAY' | 'SECURITY' | 'COMPLAINTS' | 'NOTICES';

export const MUTABLE_CATEGORIES: readonly NotificationCategory[] = ['COMPLAINTS', 'NOTICES'];

export interface EventParams {
  RENT_DUE_SOON: { name: string; month: string; amountPaise: number; dueDate: string };
  RENT_DUE_TODAY: { name: string; month: string; amountPaise: number; dueDate: string };
  RENT_OVERDUE: { name: string; month: string; amountPaise: number; daysOverdue: number };
  INVOICE_GENERATED: { month: string; amountPaise: number; dueDate: string };
  PAYMENT_RECEIVED: { amountPaise: number; receiptNumber: string };
  COMPLAINT_STATUS_CHANGED: { title: string; statusLabel: string };
  COMPLAINT_CREATED: { title: string; residentName: string };
  APPLICANT_SUBMITTED: { name: string };
  ROOM_ASSIGNED: { roomNumber: string; bedLabel: string };
  MOVED_OUT: Record<string, never>;
  NOTICE_POSTED: { title: string };
  PASSWORD_CHANGED: Record<string, never>;
}

export type NotificationEvent = keyof EventParams;

export interface RenderedMessage {
  readonly title: string;
  readonly body: string;
  /** Expo Router path opened when the notification is tapped. */
  readonly route: string;
}

export interface EventDefinition<E extends NotificationEvent> {
  readonly category: NotificationCategory;
  readonly channels: readonly NotificationChannelName[];
  readonly render: (params: EventParams[E]) => RenderedMessage;
}

const rupees = (paise: number): string => formatINR(paise, { withPaise: false });

const RENT = '/(resident)/rent';

export const EVENTS: { [E in NotificationEvent]: EventDefinition<E> } = {
  RENT_DUE_SOON: {
    category: 'FINANCIAL',
    channels: ['PUSH'],
    render: (p) => ({
      title: 'Rent due soon',
      body: `${rupees(p.amountPaise)} for ${p.month} is due on ${p.dueDate}.`,
      route: RENT,
    }),
  },
  RENT_DUE_TODAY: {
    category: 'FINANCIAL',
    channels: ['PUSH'],
    render: (p) => ({
      title: 'Rent due today',
      body: `${rupees(p.amountPaise)} for ${p.month} is due today.`,
      route: RENT,
    }),
  },
  RENT_OVERDUE: {
    category: 'FINANCIAL',
    channels: ['PUSH'],
    render: (p) => ({
      title: 'Rent overdue',
      body: `${rupees(p.amountPaise)} for ${p.month} is ${p.daysOverdue} day(s) overdue.`,
      route: RENT,
    }),
  },
  INVOICE_GENERATED: {
    category: 'FINANCIAL',
    channels: ['PUSH'],
    render: (p) => ({
      title: 'New bill',
      body: `Your ${p.month} bill of ${rupees(p.amountPaise)} is ready. Due ${p.dueDate}.`,
      route: RENT,
    }),
  },
  PAYMENT_RECEIVED: {
    category: 'FINANCIAL',
    channels: ['PUSH'],
    render: (p) => ({
      title: 'Payment received',
      body: `We received ${rupees(p.amountPaise)}. Receipt ${p.receiptNumber}.`,
      route: RENT,
    }),
  },
  COMPLAINT_STATUS_CHANGED: {
    category: 'COMPLAINTS',
    channels: ['PUSH'],
    render: (p) => ({
      title: 'Complaint updated',
      body: `"${p.title}" is now ${p.statusLabel}.`,
      route: '/(resident)/issues',
    }),
  },
  COMPLAINT_CREATED: {
    category: 'COMPLAINTS',
    channels: ['PUSH'],
    render: (p) => ({
      title: 'New complaint',
      body: `${p.residentName}: ${p.title}`,
      route: '/(owner)/issues',
    }),
  },
  APPLICANT_SUBMITTED: {
    category: 'STAY',
    channels: ['PUSH'],
    render: (p) => ({
      title: 'New admission form',
      body: `${p.name} completed their details and is waiting for a room.`,
      route: '/(owner)/more/applicants',
    }),
  },
  ROOM_ASSIGNED: {
    category: 'STAY',
    channels: ['PUSH'],
    render: (p) => ({
      title: 'Room assigned',
      body: `You have been given room ${p.roomNumber}, bed ${p.bedLabel}. Welcome!`,
      route: '/(resident)',
    }),
  },
  MOVED_OUT: {
    category: 'STAY',
    channels: ['PUSH'],
    render: () => ({
      title: 'Your stay has ended',
      body: 'Your move-out is complete. Thank you for staying with us.',
      route: '/(resident)',
    }),
  },
  NOTICE_POSTED: {
    category: 'NOTICES',
    channels: ['PUSH'],
    render: (p) => ({ title: 'New notice', body: p.title, route: '/(resident)' }),
  },
  PASSWORD_CHANGED: {
    category: 'SECURITY',
    channels: ['PUSH'],
    render: () => ({
      title: 'Password changed',
      body: 'Your password was just changed. If this was not you, contact the owner.',
      route: '/(resident)',
    }),
  },
};
