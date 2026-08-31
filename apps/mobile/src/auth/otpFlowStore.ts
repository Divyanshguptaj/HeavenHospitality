import type { OtpPurposeName } from '@heaven/contracts';
import { create } from 'zustand';

import { apiRequest } from '../lib/apiClient';

/**
 * The state of a signup or password-reset in progress.
 *
 * Signup is three screens and two server round-trips, so something has to carry
 * the phone number and the verification token between them. That something is
 * NOT route params: the token authorises setting a password, and route params
 * end up in navigation state and in any screenshot of a debug overlay. Here it
 * lives in memory, and it is cleared the moment the flow ends.
 */

interface OtpRequestResponse {
  readonly phone: string;
  readonly maskedPhone: string;
  readonly expiresInSeconds: number;
  readonly resendAvailableInSeconds: number;
  /** Development only — the API omits this in production. */
  readonly devCode?: string;
}

interface OtpVerifyResponse {
  readonly phone: string;
  readonly verificationToken: string;
  readonly expiresInSeconds: number;
}

/** The two flows differ only by which endpoints they call. */
const ENDPOINTS: Record<OtpPurposeName, { request: string; verify: string }> = {
  SIGNUP: {
    request: '/auth/signup/request-otp',
    verify: '/auth/signup/verify-otp',
  },
  PASSWORD_RESET: {
    request: '/auth/forgot-password/request-otp',
    verify: '/auth/forgot-password/verify-otp',
  },
};

interface OtpFlowState {
  readonly purpose: OtpPurposeName;
  readonly phone: string;
  readonly maskedPhone: string;
  readonly verificationToken: string | null;
  readonly resendAvailableInSeconds: number;
  /** Shown as a hint in development so there is no log to read. */
  readonly devCode: string | null;

  readonly requestCode: (purpose: OtpPurposeName, phone: string) => Promise<void>;
  readonly resendCode: () => Promise<void>;
  readonly verifyCode: (code: string) => Promise<void>;
  readonly reset: () => void;
}

export const useOtpFlowStore = create<OtpFlowState>((set, get) => ({
  purpose: 'SIGNUP',
  phone: '',
  maskedPhone: '',
  verificationToken: null,
  resendAvailableInSeconds: 0,
  devCode: null,

  requestCode: async (purpose, phone) => {
    const result = await apiRequest<OtpRequestResponse>(ENDPOINTS[purpose].request, {
      method: 'POST',
      body: { phone },
    });

    set({
      purpose,
      phone: result.phone,
      maskedPhone: result.maskedPhone,
      resendAvailableInSeconds: result.resendAvailableInSeconds,
      devCode: result.devCode ?? null,
      // Any token from a previous attempt is void the moment a new code is sent.
      verificationToken: null,
    });
  },

  resendCode: async () => {
    const { purpose, phone } = get();
    await get().requestCode(purpose, phone);
  },

  verifyCode: async (code) => {
    const { purpose, phone } = get();
    const result = await apiRequest<OtpVerifyResponse>(ENDPOINTS[purpose].verify, {
      method: 'POST',
      body: { phone, code },
    });

    set({ verificationToken: result.verificationToken });
  },

  reset: () =>
    set({
      phone: '',
      maskedPhone: '',
      verificationToken: null,
      resendAvailableInSeconds: 0,
      devCode: null,
    }),
}));

/** Completes a password reset. Not in the auth store: it ends signed OUT. */
export async function submitPasswordReset(params: {
  phone: string;
  verificationToken: string;
  password: string;
}): Promise<void> {
  await apiRequest('/auth/forgot-password/reset', { method: 'POST', body: params });
}
