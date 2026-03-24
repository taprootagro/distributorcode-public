// ============================================================================
// ChatUserService - IM User ID Generation & Registration
// ============================================================================
// Both IM providers (Tencent IM, CometChat) require
// users to be registered on their platform before they can chat.
//
// This service handles:
//   1. Generate a unique, persistent user ID per device (UUID v4)
//   2. Store user profile (nickname, avatar) in localStorage
//   3. Register the user on the IM provider via token backend
//   4. Track registration status per provider to avoid duplicate calls
//
// Registration flow:
//   Frontend → Token Backend → IM Provider REST API (create user)
//   The backend holds the API Key/Secret, frontend only sends user info.
// ============================================================================

// ---- Import auth utilities ----
import { getUserId, isServerAssignedId } from '../utils/auth';
import { storageGet, storageSet, storageRemove, storageGetJSON } from '../utils/safeStorage';
import { CONFIG_STORAGE_KEY } from '../constants';

const USER_STORAGE_KEY = 'agri_chat_user';

export interface ChatUser {
  /** Unique user ID — server-assigned UUID (production) or local numeric/UUID (demo) */
  userId: string;
  /** Display nickname */
  nickname: string;
  /** Avatar URL */
  avatarUrl: string;
  /** When the user was first created locally */
  createdAt: number;
  /** Registration status per provider */
  registrations: {
    'tencent-im'?: { registered: boolean; registeredAt?: number };
    'cometchat'?: { registered: boolean; registeredAt?: number };
  };
}

// ---- UUID v4 Generator (no external dependency) ----
function generateUUID(): string {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: manual UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---- Short ID for display (first 8 chars of UUID) ----
function shortId(uuid: string): string {
  return uuid.replace(/-/g, '').substring(0, 8).toUpperCase();
}

// ---- localStorage persistence ----
// ---- safeStorage persistence ----
function loadUser(): ChatUser | null {
  try {
    const raw = storageGet(USER_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveUser(user: ChatUser): void {
  storageSet(USER_STORAGE_KEY, JSON.stringify(user));
}

// ---- Config reading (same pattern as ChatProxyService) ----
type ChatProvider = 'tencent-im' | 'cometchat';

const VALID_PROVIDERS: ChatProvider[] = ['tencent-im', 'cometchat'];

function isValidProvider(p: unknown): p is ChatProvider {
  return typeof p === 'string' && VALID_PROVIDERS.includes(p as ChatProvider);
}

interface ProxyCfg {
  supabaseUrl: string;
  supabaseAnonKey: string;
  enabled: boolean;
  chatProvider: ChatProvider;
}

function getProxyConfig(): ProxyCfg {
  const defaults: ProxyCfg = {
    supabaseUrl: '',
    supabaseAnonKey: '',
    enabled: false,
    chatProvider: 'tencent-im',
  };
  try {
    const saved = storageGet(CONFIG_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const bpc = parsed.backendProxyConfig;
      if (bpc) {
        return {
          supabaseUrl: bpc.supabaseUrl || defaults.supabaseUrl,
          supabaseAnonKey: bpc.supabaseAnonKey || defaults.supabaseAnonKey,
          enabled: bpc.enabled ?? defaults.enabled,
          chatProvider: isValidProvider(bpc.chatProvider) ? bpc.chatProvider : defaults.chatProvider,
        };
      }
    }
  } catch { /* ignore */ }
  return defaults;
}

// ============================================================================
// Main Service Class
// ============================================================================
class ChatUserService {
  private _user: ChatUser | null = null;

  constructor() {
    this._user = loadUser();
  }

  // ---------- User ID Management ----------

  /**
   * Get or create the current user.
   * If the user is logged in and has a numeric ID from auth, use that.
   * Otherwise fall back to UUID generation (for backward compatibility).
   */
  getUser(): ChatUser {
    if (!this._user) {
      this._user = this.createNewUser();
      saveUser(this._user);
      console.log(`[ChatUser] New user created: ${this._user.userId} (${this.getShortId()}) [${isServerAssignedId() ? 'server' : 'local'}]`);
    }

    // Sync with auth effective ID (server-assigned or local) if user is logged in
    const authId = getUserId();
    if (authId && this._user.userId !== authId) {
      console.log(`[ChatUser] Syncing to auth ID: ${authId} (was: ${this._user.userId}) [${isServerAssignedId() ? 'server' : 'local'}]`);
      this._user.userId = authId;
      // If ID source changed (e.g., local → server), clear IM registrations
      // since the IM provider needs to register the new ID
      if (isServerAssignedId()) {
        this._user.registrations = {};
        console.log(`[ChatUser] Cleared IM registrations — server ID requires re-registration`);
      }
      saveUser(this._user);
    }

    return this._user;
  }

  /** Get the user ID string (creates user if not exists) */
  getUserId(): string {
    return this.getUser().userId;
  }

  /** Get short display ID (e.g. "A3F8B2C1") */
  getShortId(): string {
    return shortId(this.getUserId());
  }

  /** Check if user exists locally */
  hasUser(): boolean {
    return this._user !== null;
  }

  /** Update user profile (nickname, avatar) */
  updateProfile(nickname?: string, avatarUrl?: string): void {
    const user = this.getUser();
    if (nickname !== undefined) user.nickname = nickname;
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
    saveUser(user);
    this._user = user;
  }

  /** Reset user ID (generate new one). Clears all registrations. */
  resetUser(): ChatUser {
    this._user = this.createNewUser();
    saveUser(this._user);
    console.log(`[ChatUser] User reset. New ID: ${this._user.userId}`);
    return this._user;
  }

  // ---------- IM Provider Registration ----------

  /** Check if user is registered on the current IM provider */
  isRegistered(): boolean {
    const provider = getProxyConfig().chatProvider;
    const user = this.getUser();
    return user.registrations[provider]?.registered === true;
  }

  /** Check if user is registered on a specific provider */
  isRegisteredOn(provider: ChatProvider): boolean {
    const user = this.getUser();
    return user.registrations[provider]?.registered === true;
  }

  /**
   * Register user on the configured IM provider via token backend.
   * 
   * POST {supabaseUrl}/functions/v1/chat-token/register
   * Body: { userId, nickname, avatarUrl, provider }
   * 
   * The backend will call the provider's user creation API:
   *   - CometChat:    POST /v3/users
   *   - Tencent IM:   v4/im_open_login_svc/account_import API
   * 
   * If already registered, this is a no-op (returns true).
   */
  async registerOnProvider(): Promise<{ success: boolean; error?: string }> {
    const cfg = getProxyConfig();
    const user = this.getUser();
    const provider = cfg.chatProvider;

    // Already registered? Skip.
    if (this.isRegisteredOn(provider)) {
      console.log(`[ChatUser] Already registered on ${provider}, skipping.`);
      return { success: true };
    }

    // Backend not enabled? Mark as mock-registered.
    if (!cfg.enabled || !cfg.supabaseUrl) {
      console.log(`[ChatUser][MOCK] Mock-registering user ${user.userId} on ${provider}`);
      this.markRegistered(provider);
      return { success: true };
    }

    // Real backend call
    const endpoint = `${cfg.supabaseUrl}/functions/v1/chat-token/register`;
    console.log(`[ChatUser] Registering user ${user.userId} on ${provider} via ${endpoint}`);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.supabaseAnonKey ? { Authorization: `Bearer ${cfg.supabaseAnonKey}` } : {}),
          ...(cfg.supabaseAnonKey ? { apikey: cfg.supabaseAnonKey } : {}),
        },
        body: JSON.stringify({
          userId: user.userId,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          provider,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Registration failed' }));
        // If user already exists on provider, treat as success
        if (res.status === 409 || err.error?.includes('already exists')) {
          console.log(`[ChatUser] User already exists on ${provider}, marking as registered.`);
          this.markRegistered(provider);
          return { success: true };
        }
        console.error(`[ChatUser] Registration failed:`, err);
        return { success: false, error: err.error || 'Registration failed' };
      }

      this.markRegistered(provider);
      console.log(`[ChatUser] Successfully registered on ${provider}`);
      return { success: true };
    } catch (error) {
      console.error(`[ChatUser] Registration error:`, error);
      return { success: false, error: String(error) };
    }
  }

  // ---------- Helpers ----------

  private createNewUser(): ChatUser {
    // Prefer effective auth ID (server > local) if available
    const authId = getUserId();
    const userId = authId || generateUUID();
    return {
      userId,
      nickname: `User_${authId ? authId.slice(-6) : shortId(generateUUID())}`,
      avatarUrl: '',
      createdAt: Date.now(),
      registrations: {},
    };
  }

  private markRegistered(provider: ChatProvider): void {
    const user = this.getUser();
    user.registrations[provider] = { registered: true, registeredAt: Date.now() };
    saveUser(user);
    this._user = user;
  }

  /** Get registration status summary (for display in UI) */
  getRegistrationSummary(): { provider: ChatProvider; registered: boolean; registeredAt?: number }[] {
    const user = this.getUser();
    const providers: ChatProvider[] = ['tencent-im', 'cometchat'];
    return providers.map((p) => ({
      provider: p,
      registered: user.registrations[p]?.registered === true,
      registeredAt: user.registrations[p]?.registeredAt,
    }));
  }

  /** Clear all data */
  clearAll(): void {
    try {
      storageRemove(USER_STORAGE_KEY);
    } catch { /* ignore */ }
    this._user = null;
  }
}

// Singleton export
export const chatUserService = new ChatUserService();