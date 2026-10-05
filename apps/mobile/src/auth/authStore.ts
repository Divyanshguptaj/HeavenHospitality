import type { Role } from '@heaven/contracts';
import { create } from 'zustand';

import { apiRequest, setAccessToken, setSessionExpiredHandler, ApiRequestError } from '../lib/apiClient';
import { unregisterPush } from '../lib/pushNotifications';
import { clearRefreshToken, readRefreshToken, saveRefreshToken } from '../lib/secureTokenStore';

export interface AuthenticatedUser {
  readonly id: string;
  readonly fullName: string;
  /** The login identity, E.164. */
  readonly phone: string;
  readonly email: string | null;
  readonly role: Role;
  readonly mustChangePassword: boolean;
  /** Null until the admission form is submitted — checked before any tenancy exists. */
  readonly registrationCompletedAt: string | null;
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
  /** Creates the account and signs it in. */
  readonly signUp: (input: { phone: string; fullName: string; password: string }) => Promise<void>;
  readonly signOut: () => Promise<void>;
  /** Called right after the admission form is submitted, so the redirect gate clears without a re-login. */
  readonly markRegistrationComplete: (completedAt: string) => void;
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

/** True only when the server itself refused the token — never for a network-level failure. */
function isServerRejection(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status >= 400 && error.status < 500;
}

export const useAuthStore = create<AuthState>((set, get) => ({
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

    const exchange = (): Promise<SessionResponse> =>
      apiRequest<SessionResponse>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken, client: 'mobile' },
      });

    try {
      set({ status: 'signedIn', user: await applySession(await exchange()) });
      return;
    } catch (firstError) {
      // The server actually rejected this token — expired, revoked, or reuse
      // detected — never coming back, so there is no reason to keep it, and
      // no reason to retry.
      if (isServerRejection(firstError)) {
        console.warn('[auth] session rejected by the server, signing out', firstError);
        await clearRefreshToken().catch((clearError: unknown) => {
          console.error('[auth] could not clear the stored refresh token', clearError);
        });
        setAccessToken(null);
        set({ status: 'signedOut', user: null });
        return;
      }

      // Anything else (no connection, the API unreachable, a 5xx) says
      // nothing about whether the token is still good — the phone might just
      // have no signal for a moment, or the dev server might be mid-restart.
      // One short retry recovers most of those without ever dropping to the
      // guest screen; only a second failure gives up for this launch.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        set({ status: 'signedIn', user: await applySession(await exchange()) });
        return;
      } catch (secondError) {
        // Still not a rejection, so — unlike above — the token is kept:
        // discarding a perfectly valid session because the network is down
        // would silently drop the account back to guest and, worse, skip
        // straight past the admission-form gate, since a guest is never
        // asked for one. This launch still can't establish a session, but
        // the next attempt gets a real chance to.
        console.warn('[auth] session restore failed twice, signing out for this launch', secondError);
        setAccessToken(null);
        set({ status: 'signedOut', user: null });
      }
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
  signUp: async (input) => {
    const session = await apiRequest<SessionResponse>('/auth/signup', {
      method: 'POST',
      body: { ...input, client: 'mobile' },
    });
    set({ status: 'signedIn', user: await applySession(session) });
  },

  signOut: async () => {
    await unregisterPush();
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

  markRegistrationComplete: (completedAt: string) => {
    const current = get().user;
    if (current === null) return;
    set({ user: { ...current, registrationCompletedAt: completedAt } });
  },
}));

// A dead session can be discovered from ANY screen mid-use, not just at boot —
// the access token can expire (recovered silently, see apiClient) or the
// refresh token itself can be revoked (cannot be recovered). Only the second
// case reaches here. Flipping to `signedOut` is enough: the root layout's own
// redirect effect then sends the app back to the public screen, exactly like
// an ordinary sign-out, instead of leaving whatever screen was open stuck on
// an error the user has no way to act on.
setSessionExpiredHandler(() => {
  useAuthStore.setState({ status: 'signedOut', user: null });
});

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
