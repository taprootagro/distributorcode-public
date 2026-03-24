// ============================================================================
// Auth Utilities — Login State + User ID Management
// ============================================================================
// User ID assignment follows a two-tier strategy:
//
//   Tier 1 (Production — Backend Enabled):
//     Login → Supabase Auth verifies credentials → returns server-assigned
//     user.id (UUID) → stored locally → used as IM identity.
//     The server-assigned ID is cryptographically random, globally unique,
//     and cannot be forged by the client. The Edge Function's /auth endpoint
//     is the single source of truth.
//
//   Tier 2 (Template Demo — No Backend):
//     Login → client generates a 10-digit numeric ID locally.
//     This is ONLY for white-label template preview / offline demo.
//     It provides no security guarantees.
//
// ID storage keys:
//   - SERVER_USER_ID_KEY: server-assigned ID (takes priority)
//   - NUMERIC_ID_KEY:     locally generated fallback
//
// The IM registration flow uses whichever ID is available (server > local).
// ============================================================================

const LOGIN_KEY = "isLoggedIn";
const NUMERIC_ID_KEY = "agri_user_numeric_id";
const SERVER_USER_ID_KEY = "agri_server_user_id";
const AUTH_SOURCE_KEY = "agri_auth_source"; // "server" | "local"
const ACCESS_TOKEN_KEY = "agri_access_token"; // JWT from Supabase Auth

import { mirrorAuthToDexie } from './db';
import { storageGet, storageSet, storageRemove } from './safeStorage';

/**
 * Check if user is logged in
 */
export function isUserLoggedIn(): boolean {
  return storageGet(LOGIN_KEY) === "true";
}

/**
 * Set user login status.
 * When logging in (status=true) WITHOUT a server ID, generates a local fallback.
 * When logging out (status=false), preserves IDs for potential re-login.
 *
 * For server-assigned IDs, call setServerUserId() BEFORE setUserLoggedIn(true).
 */
export function setUserLoggedIn(status: boolean): void {
  if (status) {
    storageSet(LOGIN_KEY, "true");
    // If no server ID was set before this call, generate a local fallback
    if (!getServerUserId() && !getLocalNumericId()) {
      const newId = generateNumericId();
      storageSet(NUMERIC_ID_KEY, newId);
      storageSet(AUTH_SOURCE_KEY, "local");
      console.log(`[Auth] Local fallback ID generated: ${newId} (no backend)`);
    }
    // Mirror to encrypted Dexie backup (fire-and-forget)
    mirrorAuthToDexie().catch(() => {});
  } else {
    storageRemove(LOGIN_KEY);
    // Preserve IDs so re-login retains the same IM identity
    mirrorAuthToDexie().catch(() => {});
  }
}

// ---- Server-Assigned ID (Tier 1 — Production) ----

/**
 * Store a server-assigned user ID (from Supabase Auth via Edge Function).
 * This MUST be called before setUserLoggedIn(true) when backend is available.
 *
 * @param id - The user.id UUID returned by Supabase Auth
 */
export function setServerUserId(id: string): void {
  storageSet(SERVER_USER_ID_KEY, id);
  storageSet(AUTH_SOURCE_KEY, "server");
  console.log(`[Auth] Server-assigned user ID stored: ${id}`);
  // Mirror to encrypted Dexie backup (fire-and-forget)
  mirrorAuthToDexie().catch(() => {});
}

/**
 * Get the server-assigned user ID (null if not set / using local fallback)
 */
export function getServerUserId(): string | null {
  return storageGet(SERVER_USER_ID_KEY);
}

/**
 * Check whether the current ID was assigned by the server (secure) or
 * generated locally (insecure demo mode).
 */
export function isServerAssignedId(): boolean {
  return storageGet(AUTH_SOURCE_KEY) === "server";
}

// ---- Access Token (JWT for API Authorization) ----

/**
 * Store the access token (JWT) returned by Supabase Auth.
 * This token is sent as `Authorization: Bearer <token>` in API requests,
 * allowing the backend to verify the user's identity via `auth.getUser(token)`.
 *
 * @param token - JWT access token from Supabase Auth
 */
export function setAccessToken(token: string): void {
  storageSet(ACCESS_TOKEN_KEY, token);
  console.log(`[Auth] Access token stored (${token.slice(0, 20)}...)`);
}

/**
 * Get the stored access token (null if not set / demo mode).
 * When present, this should be used for Authorization headers instead of anonKey.
 */
export function getAccessToken(): string | null {
  return storageGet(ACCESS_TOKEN_KEY);
}

/**
 * Clear the access token (e.g., on logout or token expiry).
 */
export function clearAccessToken(): void {
  storageRemove(ACCESS_TOKEN_KEY);
}

// ---- Effective User ID (used by IM services) ----

/**
 * Get the user's effective ID for IM communication.
 * Priority: server-assigned UUID > locally generated numeric ID > null
 */
export function getUserId(): string | null {
  return getServerUserId() || getLocalNumericId();
}

/**
 * @deprecated Use getUserId() instead. Kept for backward compatibility.
 * Returns the locally generated numeric ID (null if never generated).
 */
export function getNumericUserId(): string | null {
  // Return effective ID (server > local) for backward compatibility
  return getUserId();
}

/**
 * Get ONLY the locally generated numeric ID (ignoring server ID).
 * Used internally and for migration scenarios.
 */
export function getLocalNumericId(): string | null {
  return storageGet(NUMERIC_ID_KEY);
}

/**
 * Generate a 10-digit unique numeric ID (local fallback only).
 * Format: 6 timestamp-derived digits + 4 random digits
 */
function generateNumericId(): string {
  const timePart = (Date.now() % 1_000_000_000).toString().padStart(9, "0").slice(0, 6);
  const randPart = Math.floor(1000 + Math.random() * 9000).toString();
  return timePart + randPart;
}

/**
 * Clear all auth data (login status + all IDs).
 * Use this for "delete account" scenarios.
 */
export function clearAuthData(): void {
  storageRemove(LOGIN_KEY);
  storageRemove(NUMERIC_ID_KEY);
  storageRemove(SERVER_USER_ID_KEY);
  storageRemove(AUTH_SOURCE_KEY);
  storageRemove(ACCESS_TOKEN_KEY);
  // Mirror cleared state to Dexie
  mirrorAuthToDexie().catch(() => {});
}

/**
 * Check if login is required; if not logged in, navigate to login page.
 */
export function requireLogin(
  navigate: (path: string) => void,
  callback?: () => void
): boolean {
  const loggedIn = isUserLoggedIn();

  if (!loggedIn) {
    navigate("/login");
    return false;
  }

  if (callback) {
    callback();
  }

  return true;
}