/** No types are shipped with the package — this is the shape of what it actually exports at runtime. */
declare module 'react-native-razorpay' {
  export interface RazorpayCheckoutOptions {
    readonly key: string;
    readonly amount: number;
    readonly currency: string;
    readonly order_id: string;
    readonly name?: string;
    readonly description?: string;
    readonly prefill?: {
      readonly email?: string;
      readonly contact?: string;
      readonly name?: string;
    };
    readonly theme?: { readonly color?: string };
  }

  export interface RazorpaySuccessResponse {
    readonly razorpay_payment_id: string;
    readonly razorpay_order_id: string;
    readonly razorpay_signature: string;
  }

  export interface RazorpayErrorResponse {
    readonly code?: number;
    readonly description?: string;
    readonly error?: { readonly code?: string; readonly description?: string; readonly reason?: string };
  }

  export default class RazorpayCheckout {
    static open(options: RazorpayCheckoutOptions): Promise<RazorpaySuccessResponse>;
  }
}
