import { roleHasPermission, type Permission, type Role } from '@heaven/contracts';
import { create } from 'zustand';

import { apiRequest, setAccessToken } from '../lib/apiClient';

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
}

type AuthStatus = 'restoring' | 'signedOut' | 'signedIn';

interface AuthState {
  readonly status: AuthStatus;
  readonly user: AuthenticatedUser | null;
  readonly restore: () => Promise<void>;
  readonly signIn: (identifier: string, password: string) => Promise<AuthenticatedUser>;
  readonly signOut: () => Promise<void>;
}

/**
 * Admin auth state.
 *
 * The access token is never stored here — it lives in the api client's module
 * scope, and the refresh token is an httpOnly cookie the browser sends on the two
 * auth endpoints. Nothing reaches `localStorage`, so an XSS cannot walk away with
 * a 30-day credential. See docs/0003-auth-and-sessions.md.
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: 'restoring',
  user: null,

  /**
   * On page load there is no token in memory, so we ask the server to exchange
   * the refresh cookie for one. A 401 simply means "not signed in".
   */
  restore: async () => {
    try {
      const { data } = await apiRequest<SessionResponse>('/auth/refresh', {
        method: 'POST',
        body: { client: 'web' },
      });
      setAccessToken(data.accessToken);
      set({ status: 'signedIn', user: data.user });
    } catch {
      setAccessToken(null);
      set({ status: 'signedOut', user: null });
    }
  },

  signIn: async (identifier: string, password: string) => {
    const { data } = await apiRequest<SessionResponse>('/auth/login', {
      method: 'POST',
      body: { identifier, password, client: 'web', deviceLabel: 'Admin console' },
    });
    setAccessToken(data.accessToken);
    set({ status: 'signedIn', user: data.user });
    return data.user;
  },

  signOut: async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST', body: {} });
    } catch {
      // Signing out locally must succeed even if the request fails.
    }
    setAccessToken(null);
    set({ status: 'signedOut', user: null });
  },
}));

/**
 * Whether the user may use the console at all.
 *
 * Tenants have accounts but no operational role, and the admin console is not
 * built for them — they use the mobile app. This is a routing decision only; the
 * API rejects their requests regardless.
 */
export function canAccessConsole(user: AuthenticatedUser | null): boolean {
  return user !== null && user.memberships.some((m) => m.role !== 'TENANT');
}

/**
 * Drives which navigation entries are shown.
 *
 * A UX affordance, never a security control: the server authorises every request
 * independently. Hiding a button is not authorization.
 */
export function userHasPermission(user: AuthenticatedUser | null, permission: Permission): boolean {
  return user !== null && user.memberships.some((m) => roleHasPermission(m.role, permission));
}
