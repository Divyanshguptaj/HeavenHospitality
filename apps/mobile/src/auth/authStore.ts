import type { Role } from '@heaven/contracts';
import { create } from 'zustand';

import { apiRequest, setAccessToken } from '../lib/apiClient';
import { clearRefreshToken, readRefreshToken, saveRefreshToken } from '../lib/secureTokenStore';

export interface AuthenticatedUser {
  readonly id: string;
  readonly fullName: string;
  /** The login identity, E.164. */
  readonly phone: string;
  readonly email: string | null;
  readonly role: Role;
  readonly phoneVerified: boolean;
  readonly mustChangePassword: boolean;
  readonly memberships: ReadonlyArray<{
    readonly propertyId: string;
    readonly propertySlug: string;
    readonly propertyName: string;
    readonly role: Role;
  }>;
}

interface SessionResponse {
  readonly user: AuthenticatedUser;
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly refreshToken?: string;
}

/** `restoring` covers app boot, before we know whether a stored session is valid. */
type AuthStatus = 'restoring' | 'signedOut' | 'signedIn';

interface AuthState {
  readonly status: AuthStatus;
  readonly user: AuthenticatedUser | null;
  readonly restore: () => Promise<void>;
  readonly signIn: (phone: string, password: string) => Promise<void>;
  /** Finishes signup once the phone number has been verified by OTP. */
  readonly completeSignup: (input: {
    phone: string;
    verificationToken: string;
    fullName: string;
    password: string;
  }) => Promise<void>;
  readonly signOut: () => Promise<void>;
}

/**
 * Authentication is one of the few genuinely global pieces of *client* state, so
 * it lives in Zustand. Everything fetched from the API stays in TanStack Query.
 *
 * The access token never enters this store: it lives in the api client's module
 * scope, and the refresh token lives in the OS keystore. Neither is ever written
 * to component state, where it could end up in a serialised snapshot.
 */
async function applySession(session: SessionResponse): Promise<AuthenticatedUser> {
  setAccessToken(session.accessToken);
  if (session.refreshToken !== undefined) {
    await saveRefreshToken(session.refreshToken);
  }
  return session.user;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'restoring',
  user: null,

  /**
   * Called once at boot. A stored refresh token is exchanged for a fresh access
   * token; any failure means "signed out" rather than an error screen, because a
   * guest must still be able to use the app.
   */
  restore: async () => {
    let refreshToken: string | null;
    try {
      refreshToken = await readRefreshToken();
    } catch (error) {
      console.error('[auth] could not read the stored refresh token', error);
      set({ status: 'signedOut', user: null });
      return;
    }

    if (refreshToken === null) {
      set({ status: 'signedOut', user: null });
      return;
    }

    try {
      const session = await apiRequest<SessionResponse>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken, client: 'mobile' },
      });
      set({ status: 'signedIn', user: await applySession(session) });
    } catch (error) {
      // Expired, revoked, or reuse-detected. Discard it so the next boot is fast.
      console.warn('[auth] session restore failed, signing out', error);
      await clearRefreshToken().catch((clearError: unknown) => {
        console.error('[auth] could not clear the stored refresh token', clearError);
      });
      setAccessToken(null);
      set({ status: 'signedOut', user: null });
    }
  },

  signIn: async (phone: string, password: string) => {
    const session = await apiRequest<SessionResponse>('/auth/login', {
      method: 'POST',
      body: { phone, password, client: 'mobile', deviceLabel: 'Mobile app' },
    });
    set({ status: 'signedIn', user: await applySession(session) });
  },

  /**
   * The last step of signup. The server decides the role — every new account is
   * a NON_RESIDENT, and there is no field here that could ask for anything
   * else. Becoming a RESIDENT is something the owner does, not something a
   * client can request.
   */
  completeSignup: async (input) => {
    const session = await apiRequest<SessionResponse>('/auth/signup/set-password', {
      method: 'POST',
      body: { ...input, client: 'mobile' },
    });
    set({ status: 'signedIn', user: await applySession(session) });
  },

  signOut: async () => {
    const refreshToken = await readRefreshToken();
    try {
      // Best-effort: the server revokes the session so a stolen refresh token is
      // dead even if this device never comes back.
      await apiRequest('/auth/logout', {
        method: 'POST',
        body: { refreshToken: refreshToken ?? undefined },
      });
    } catch {
      // Signing out locally must succeed even with no network.
    }
    await clearRefreshToken();
    setAccessToken(null);
    set({ status: 'signedOut', user: null });
  },
}));

/**
 * Which section of the app an account opens.
 *
 * These shape the UI only. Every endpoint authorises independently, so an
 * account that reached the wrong section would still be refused by the server.
 */

/** The PG owner. Runs the property. */
export function isAdmin(user: AuthenticatedUser | null): boolean {
  return user?.role === 'ADMIN';
}

/** Currently lives here, so has rent, meals and complaints of their own. */
export function isResident(user: AuthenticatedUser | null): boolean {
  return user?.role === 'RESIDENT';
}

/**
 * Registered, but not a tenant — what every public signup produces.
 *
 * A non-resident sees exactly the public experience plus a profile, so there is
 * no separate section for this role and nothing here to guard.
 */
export function isNonResident(user: AuthenticatedUser | null): boolean {
  return user?.role === 'NON_RESIDENT';
}
