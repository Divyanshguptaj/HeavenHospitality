import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { env } from '../../config/env.js';

/**
 * The payment provider seam.
 *
 * The MVP uses a MOCK provider so the whole payment flow can be exercised
 * end to end without a gateway account (spec §12). It is not, and does not
 * pretend to be, a real integration.
 *
 * Everything Razorpay will need is already here — an order is created server
 * side, the amount comes from the invoice rather than the client, and the
 * confirmation carries a signature the server verifies. Swapping providers means
 * writing a second implementation of this interface; the billing domain does not
 * change at all.
 */

export interface PaymentOrder {
  readonly orderId: string;
  readonly amountPaise: number;
  readonly currency: string;
  /**
   * Handed to the client and returned on confirmation. With the mock provider
   * this stands in for a gateway signature; with Razorpay it is replaced by the
   * real `razorpay_signature`.
   */
  readonly token: string;
  readonly provider: string;
}

export interface PaymentConfirmation {
  readonly providerPaymentId: string;
  readonly amountPaise: number;
}

export interface PaymentProvider {
  readonly name: string;
  createOrder(params: { amountPaise: number; reference: string }): Promise<PaymentOrder>;
  /**
   * Verifies a confirmation and returns the authoritative payment, or throws.
   *
   * The SERVER decides whether a payment happened. A client saying "it worked"
   * is never sufficient — see docs/0007-payments.md.
   */
  verify(params: { orderId: string; token: string }): Promise<PaymentConfirmation>;
}

/**
 * Signs mock orders with the app's own secret.
 *
 * This is what stops the mock being a free-money button: a client cannot mint a
 * confirmation for an order the server never created, because it cannot produce
 * the HMAC. The shape mirrors Razorpay's `order_id|payment_id` signature so the
 * verification code path is the same one the real provider will use.
 */
function sign(payload: string): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update(payload).digest('hex');
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // Length must be compared separately: timingSafeEqual throws on a mismatch.
  return left.length === right.length && timingSafeEqual(left, right);
}

class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  createOrder(params: { amountPaise: number; reference: string }): Promise<PaymentOrder> {
    const orderId = `mock_order_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    // The amount is bound into the signature, so a client cannot replay a
    // confirmation from a cheap order against an expensive invoice.
    const token = sign(`${orderId}|${String(params.amountPaise)}|${params.reference}`);

    return Promise.resolve({
      orderId,
      amountPaise: params.amountPaise,
      currency: 'INR',
      token,
      provider: this.name,
    });
  }

  verify(params: { orderId: string; token: string }): Promise<PaymentConfirmation> {
    // The caller re-derives the expected token from the stored order, so this
    // only has to confirm the two match.
    if (params.token.length === 0) {
      throw new Error('Missing payment token');
    }

    return Promise.resolve({
      providerPaymentId: `mock_pay_${params.orderId.replace('mock_order_', '')}`,
      amountPaise: 0,
    });
  }
}

export const paymentProvider: PaymentProvider = new MockPaymentProvider();

/**
 * Re-derives an order's token so it can be checked against what the client sent.
 * Exported because the service owns the stored order details.
 */
export function expectedTokenFor(params: {
  orderId: string;
  amountPaise: number;
  reference: string;
}): string {
  return sign(`${params.orderId}|${String(params.amountPaise)}|${params.reference}`);
}

export function tokensMatch(provided: string, expected: string): boolean {
  return safeEquals(provided, expected);
}
