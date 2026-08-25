import type { Role } from '@heaven/contracts';
import { create } from 'zustand';

import { apiRequest, setAccessToken } from '../lib/apiClient';
import { clearRefreshToken, readRefreshToken, saveRefreshToken } from '../lib/secureTokenStore';

export interface AuthenticatedUser {
  readonly id: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly mustChangePassword: boolean;
  readonly primaryRole: Role;
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
  readonly signIn: (identifier: string, password: string) => Promise<void>;
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
    const refreshToken = await readRefreshToken();
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
    } catch {
      // Expired, revoked, or reuse-detected. Discard it so the next boot is fast.
      await clearRefreshToken();
      setAccessToken(null);
      set({ status: 'signedOut', user: null });
    }
  },

  signIn: async (identifier: string, password: string) => {
    const session = await apiRequest<SessionResponse>('/auth/login', {
      method: 'POST',
      body: { identifier, password, client: 'mobile', deviceLabel: 'Mobile app' },
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
 * The mobile app serves residents and guests. The owner belongs in the admin
 * console — the two experiences are deliberately separate, and squeezing
 * property operations into a phone would produce a worse tool for both.
 */
export function isResidentExperience(user: AuthenticatedUser | null): boolean {
  return user?.primaryRole === 'RESIDENT';
}
