import { Router, type Request, type Response } from 'express';

import { logger } from '../../lib/logger.js';
import { verifyWebhookSignature } from './payment.provider.js';
import { settleOnlinePaymentFromWebhook } from './payments.service.js';

/**
 * Razorpay webhooks — the belt-and-suspenders path that settles a payment even
 * if the resident's app closes before the client callback fires.
 *
 * Mounted with `express.raw()` in app.ts, BEFORE the global JSON parser:
 * signature verification hashes the exact bytes Razorpay sent, and once
 * express.json() has parsed and re-serialised the body those bytes differ and
 * every signature check fails. See docs/0007-payments.md.
 */
export const paymentWebhookRouter: Router = Router();

interface RazorpayPaymentEntity {
  readonly id: string;
  readonly order_id: string | null;
  readonly notes?: Record<string, unknown> | null;
}

interface RazorpayWebhookPayload {
  readonly event: string;
  readonly payload: {
    readonly payment?: { readonly entity: RazorpayPaymentEntity };
  };
}

function parseInvoiceIdsNote(raw: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) return null;
    return parsed;
  } catch {
    return null;
  }
}

paymentWebhookRouter.post('/', async (req: Request, res: Response) => {
  const rawBody = req.body as Buffer;
  const signature = req.get('x-razorpay-signature');

  // Never logged: the raw body can carry card/UPI details and the signature
  // itself is a secret-derived value. See docs/0007-payments.md.
  if (!verifyWebhookSignature(rawBody, signature)) {
    logger.warn({ msg: 'razorpay webhook: signature verification failed' });
    res.status(400).json({ ok: false });
    return;
  }

  let event: RazorpayWebhookPayload;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as RazorpayWebhookPayload;
  } catch {
    logger.warn({ msg: 'razorpay webhook: body is not valid JSON' });
    res.status(400).json({ ok: false });
    return;
  }

  // Every other event (payment.failed, order.paid, refund.*, …) needs no
  // action here: a failed payment is simply never recorded, and a refund is a
  // separate, not-yet-built flow (see docs/0007-payments.md#refunds). Always
  // 200, so Razorpay does not retry an event this server intentionally ignores.
  if (event.event !== 'payment.captured') {
    res.status(200).json({ ok: true, ignored: event.event });
    return;
  }

  const payment = event.payload.payment?.entity;
  const invoiceIdsRaw = payment?.notes?.['invoiceIds'];
  const invoiceIds =
    typeof invoiceIdsRaw === 'string' ? parseInvoiceIdsNote(invoiceIdsRaw) : null;

  if (payment === undefined || invoiceIds === null || invoiceIds.length === 0 || payment.order_id === null) {
    logger.error({ msg: 'razorpay webhook: payment.captured missing invoiceIds/order_id', event: event.event });
    // Acknowledged, not retried: a malformed payload will never resolve by
    // Razorpay sending it again.
    res.status(200).json({ ok: true, ignored: 'malformed payload' });
    return;
  }

  try {
    await settleOnlinePaymentFromWebhook({
      invoiceIds,
      orderId: payment.order_id,
      providerPaymentId: payment.id,
    });
    res.status(200).json({ ok: true });
  } catch (error) {
    // Unexpected (a DB hiccup, say) — worth a retry, unlike a malformed
    // payload above, which would just fail the same way again.
    logger.error({ msg: 'razorpay webhook: settlement failed', err: error });
    res.status(500).json({ ok: false });
  }
});
