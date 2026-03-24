// ============================================================================
// IMAdapter - Unified IM Channel Abstraction
// ============================================================================
// Single mode: im-provider-direct — Direct IM SDK (CometChat/Tencent)
//
// Messages are sent/received via provider's client-side SDK over WebSocket.
// Token generation still requires a backend endpoint (Edge Function or custom).
// ============================================================================

import type { ChatMessage } from './ChatProxyService';
import type { IMMode, ChatProvider } from '../hooks/useHomeConfig';
import { storageGet } from '../utils/safeStorage';
import { IMProviderDirectAdapter } from './IMProviderDirectAdapter';
import { CONFIG_STORAGE_KEY } from '../constants';

// ---- Adapter Interface ----

export interface IMAdapterConfig {
  imMode: IMMode;
  chatProvider: ChatProvider;
  supabaseUrl: string;
  supabaseAnonKey: string;
  // Provider-specific
  tencentAppId: string;
  cometchatAppId: string;
  cometchatRegion: string;
}

export interface IIMAdapter {
  /** Adapter mode name */
  readonly mode: IMMode;

  /** Human-readable description of the current mode */
  readonly modeLabel: string;

  /** Initialize the adapter (connect SDK, subscribe, etc.) */
  connect(userId: string, channelName: string): Promise<void>;

  /** Disconnect and clean up */
  disconnect(): void;

  /** Send a message through this adapter */
  sendMessage(msg: {
    id: string;
    content: string;
    type: 'text' | 'image' | 'voice';
    senderId: string;
    targetUserId: string;
    channelName: string;
    duration?: number;
    audioBlob?: Blob;
  }): Promise<{ success: boolean; serverTimestamp?: number; audioUrl?: string; error?: string }>;

  /** Fetch message history */
  getHistory(channelName: string, limit?: number): Promise<ChatMessage[]>;

  /** Register a listener for incoming messages */
  onMessage(listener: (msg: ChatMessage) => void): () => void;

  /** Whether the adapter is currently connected */
  readonly isConnected: boolean;
}

// ---- Config Reader ----

const VALID_PROVIDERS: ChatProvider[] = ['tencent-im', 'cometchat'];

function isValidChatProvider(p: unknown): p is ChatProvider {
  return typeof p === 'string' && VALID_PROVIDERS.includes(p as ChatProvider);
}

export function getIMAdapterConfig(): IMAdapterConfig {
  const defaults: IMAdapterConfig = {
    imMode: 'im-provider-direct',
    chatProvider: 'tencent-im',
    supabaseUrl: '',
    supabaseAnonKey: '',
    tencentAppId: '',
    cometchatAppId: '',
    cometchatRegion: 'us',
  };

  try {
    const saved = storageGet(CONFIG_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const bpc = parsed.backendProxyConfig;
      if (bpc) {
        return {
          imMode: 'im-provider-direct',
          chatProvider: isValidChatProvider(bpc.chatProvider) ? bpc.chatProvider : defaults.chatProvider,
          supabaseUrl: bpc.supabaseUrl || defaults.supabaseUrl,
          supabaseAnonKey: bpc.supabaseAnonKey || defaults.supabaseAnonKey,
          tencentAppId: bpc.tencentAppId || '',
          cometchatAppId: bpc.cometchatAppId || '',
          cometchatRegion: bpc.cometchatRegion || 'us',
        };
      }
    }
  } catch { /* ignore */ }
  return defaults;
}

// ---- Mode Label ----
export const IM_MODE_LABELS: Record<IMMode, { zh: string; en: string; desc_zh: string; desc_en: string; icon: string; color: string; activeColor: string }> = {
  'im-provider-direct': {
    zh: 'IM服务商直连 (SDK)',
    en: 'IM Provider Direct (SDK)',
    desc_zh: '加载服务商客户端SDK，消息走WebSocket直连，延迟最低，适合高并发实时聊天',
    desc_en: 'Load provider client SDK, messages via direct WebSocket. Lowest latency, best for high-traffic real-time chat',
    icon: 'D',
    color: 'border-violet-400 bg-violet-50',
    activeColor: 'ring-violet-400',
  },
};

// ---- Factory ----

/**
 * Create the IM adapter (always im-provider-direct).
 */
export function createIMAdapter(config?: IMAdapterConfig): IIMAdapter {
  const cfg = config || getIMAdapterConfig();
  console.log(`[IMAdapter] Creating adapter: mode=im-provider-direct, provider=${cfg.chatProvider}`);
  return new IMProviderDirectAdapter(cfg);
}

/** Singleton adapter instance — recreated when config changes */
let _currentAdapter: IIMAdapter | null = null;

/**
 * Get or create the singleton adapter.
 */
export function getIMAdapter(): IIMAdapter {
  if (_currentAdapter) {
    return _currentAdapter;
  }
  _currentAdapter = createIMAdapter();
  return _currentAdapter;
}

/**
 * Force recreate the adapter (e.g. after config save in ConfigManager).
 */
export function resetIMAdapter(): IIMAdapter {
  if (_currentAdapter) {
    _currentAdapter.disconnect();
    _currentAdapter = null;
  }
  return getIMAdapter();
}