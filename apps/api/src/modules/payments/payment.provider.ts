import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import Razorpay from 'razorpay';

import { AppError } from '../../errors/AppError.js';
import { env, features } from '../../config/env.js';

/**
 * The payment provider seam.
 *
 * `paymentProvider` is Razorpay whenever `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`
 * are set, and falls back to a mock otherwise — so a fresh clone with no
 * gateway account still runs the whole flow end to end (spec §12). Swapping
 * providers means writing a second implementation of this interface; the
 * billing domain in payments.service.ts does not change at all.
 */

export interface PaymentOrder {
  readonly orderId: string;
  readonly amountPaise: number;
  readonly currency: string;
  readonly provider: string;
  /** Razorpay's public key id — the client needs this to open Checkout. Null for the mock provider, which has no real checkout to open. */
  readonly keyId: string | null;
  /**
   * The mock provider's stand-in for what a real checkout hands back on
   * success. Real providers never set this — the client gets those fields
   * from Razorpay Checkout itself once payment completes.
   */
  readonly mock?: { readonly providerPaymentId: string; readonly signature: string } | undefined;
}

export interface PaymentConfirmation {
  readonly providerPaymentId: string;
  readonly amountPaise: number;
}

export interface PaymentProvider {
  readonly name: string;
  createOrder(params: { amountPaise: number; invoiceIds: readonly string[] }): Promise<PaymentOrder>;
  /**
   * Verifies a confirmation and returns the authoritative payment, or throws.
   *
   * `signature` is what the provider itself signed — Razorpay's
   * `razorpay_signature` (HMAC of `orderId|providerPaymentId` with the key
   * secret), or the mock's own stand-in of the same shape. The SERVER decides
   * whether a payment happened; a client saying "it worked" is never
   * sufficient. See docs/0007-payments.md.
   */
  verify(params: {
    orderId: string;
    providerPaymentId: string;
    signature: string;
  }): Promise<PaymentConfirmation>;
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // Length must be compared separately: timingSafeEqual throws on a mismatch.
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Signs mock confirmations with the app's own secret.
 *
 * This is what stops the mock being a free-money button: a client cannot mint
 * a confirmation for an order the server never created, because it cannot
 * produce the HMAC.
 */
function signMock(orderId: string, providerPaymentId: string): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update(`${orderId}|${providerPaymentId}`).digest('hex');
}

class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  createOrder(params: { amountPaise: number; invoiceIds: readonly string[] }): Promise<PaymentOrder> {
    const orderId = `mock_order_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const providerPaymentId = `mock_pay_${orderId.replace('mock_order_', '')}`;

    return Promise.resolve({
      orderId,
      amountPaise: params.amountPaise,
      currency: 'INR',
      provider: this.name,
      keyId: null,
      mock: { providerPaymentId, signature: signMock(orderId, providerPaymentId) },
    });
  }

  verify(params: {
    orderId: string;
    providerPaymentId: string;
    signature: string;
  }): Promise<PaymentConfirmation> {
    const expected = signMock(params.orderId, params.providerPaymentId);
    if (!safeEquals(params.signature, expected)) {
      throw new AppError(
        'PAYMENT_VERIFICATION_FAILED',
        'We could not verify that payment. Nothing has been charged.',
      );
    }
    return Promise.resolve({ providerPaymentId: params.providerPaymentId, amountPaise: 0 });
  }
}

/** `null` when Razorpay is not configured — every method on the class below throws before using it. */
const razorpayClient = features.razorpay
  ? new Razorpay({ key_id: env.RAZORPAY_KEY_ID as string, key_secret: env.RAZORPAY_KEY_SECRET as string })
  : null;

class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay';

  async createOrder(params: { amountPaise: number; invoiceIds: readonly string[] }): Promise<PaymentOrder> {
    if (razorpayClient === null) {
      throw new AppError('PROVIDER_UNAVAILABLE', 'Online payments are not configured yet.');
    }

    // `notes.invoiceIds` is echoed back on every webhook event for this order —
    // it is how the webhook (which carries no authenticated actor) resolves
    // which invoice(s) a payment belongs to. Razorpay's `receipt` field is
    // capped at 40 characters, too short to hold a list of uuids, so it gets a
    // short label instead and the real list travels only in `notes`.
    const order = await razorpayClient.orders.create({
      amount: params.amountPaise,
      currency: 'INR',
      receipt: `pay_${randomUUID().replace(/-/g, '').slice(0, 30)}`,
      notes: { invoiceIds: JSON.stringify(params.invoiceIds) },
    });

    return {
      orderId: order.id,
      amountPaise: params.amountPaise,
      currency: 'INR',
      provider: this.name,
      keyId: env.RAZORPAY_KEY_ID as string,
    };
  }

  async verify(params: {
    orderId: string;
    providerPaymentId: string;
    signature: string;
  }): Promise<PaymentConfirmation> {
    if (razorpayClient === null) {
      throw new AppError('PROVIDER_UNAVAILABLE', 'Online payments are not configured yet.');
    }

    const expected = createHmac('sha256', env.RAZORPAY_KEY_SECRET as string)
      .update(`${params.orderId}|${params.providerPaymentId}`)
      .digest('hex');
    if (!safeEquals(params.signature, expected)) {
      throw new AppError(
        'PAYMENT_VERIFICATION_FAILED',
        'We could not verify that payment. Nothing has been charged.',
      );
    }

    // A verified signature proves the payment id belongs to this order — it
    // does not by itself prove Razorpay captured the money. That is only
    // known by asking Razorpay directly. See docs/0007-payments.md.
    const payment = await razorpayClient.payments.fetch(params.providerPaymentId);
    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      throw new AppError(
        'PAYMENT_VERIFICATION_FAILED',
        'Razorpay has not confirmed this payment yet.',
      );
    }

    return { providerPaymentId: params.providerPaymentId, amountPaise: Number(payment.amount) };
  }
}

export const paymentProvider: PaymentProvider = features.razorpay
  ? new RazorpayPaymentProvider()
  : new MockPaymentProvider();

/**
 * Verifies a Razorpay webhook's signature against the RAW request body —
 * mounted before express.json() precisely so these bytes are untouched. See
 * docs/0007-payments.md and app.ts.
 */
export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (env.RAZORPAY_WEBHOOK_SECRET === undefined || signatureHeader === undefined || signatureHeader === '') {
    return false;
  }
  const expected = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeEquals(signatureHeader, expected);
}
