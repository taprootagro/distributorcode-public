// ============================================================================
// ChatProxyService - Chat Service (IM SDK Direct + Mock Mode)
// ============================================================================
// This service is the main chat abstraction used by CommunityPage / useChatMessages.
//
// Two modes:
//   - "backend" mode: delegates to IMProviderDirectAdapter (SDK direct connection)
//   - "mock" mode: simulates chat locally when no IM provider is configured
//
// IM Provider support (via IMProviderDirectAdapter):
//   - Tencent IM (SDK) — @tencentcloud/chat
//   - CometChat (SDK) — @cometchat/chat-sdk-javascript
//
// In MOCK mode (no provider configured), it simulates server responses locally.
// ============================================================================

import { storageGet } from '../utils/safeStorage';
import { getAccessToken } from '../utils/auth';
import { CONFIG_STORAGE_KEY } from '../constants';
import { getUserId } from '../utils/auth';
import { getIMAdapter, resetIMAdapter } from './IMAdapter';

export interface ChatMessage {
  id: string;
  channelName: string;
  senderId: string;
  content: string;
  type: "text" | "image" | "voice";
  timestamp: number;
  status: "sending" | "sent" | "failed";
  read: boolean;
  duration?: number;
  /** For voice messages: playable audio URL (objectURL in mock, remote URL in backend) */
  audioUrl?: string;
}

// ---- Configuration ----
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
  tencentAppId: string;
  cometchatAppId: string;
}

function getProxyConfig(): ProxyCfg {
  const defaults: ProxyCfg = {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
    enabled: false,
    chatProvider: 'tencent-im',
    tencentAppId: '',
    cometchatAppId: '',
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
          tencentAppId: bpc.tencentAppId || '',
          cometchatAppId: bpc.cometchatAppId || '',
        };
      }
    }
  } catch {
    // ignore parse errors
  }
  return defaults;
}

function isBackendAvailable(): boolean {
  const cfg = getProxyConfig();
  return cfg.enabled && !!cfg.supabaseUrl && !cfg.supabaseUrl.includes("your-");
}

// ---- Provider display names ----
export const CHAT_PROVIDER_INFO: Record<ChatProvider, { name: string; nameZh: string; features: string[] }> = {
  'tencent-im': {
    name: 'Tencent IM',
    nameZh: '腾讯云即时通信',
    features: ['Text', 'Image', 'Voice', 'Audio Call', 'Video Call', 'Group Chat'],
  },
  'cometchat': {
    name: 'CometChat',
    nameZh: 'CometChat',
    features: ['Text', 'Image', 'Voice', 'Audio Call', 'Video Call', 'Group Chat', 'AI Bots'],
  },
};

// ---- Mock data store ----
const mockMessageStore: ChatMessage[] = [];

export class ChatProxyService {
  private currentUserId: string = "me";
  private currentChannel: string = "default-channel";
  private _listeners = new Set<(msg: ChatMessage) => void>();
  private _targetUserId: string | null = null;
  private _mode: "backend" | "mock" = "mock";
  private _mockWarningShown = false;
  private _seenMessageIds: Set<string> = new Set();
  private _adapterUnsubscribe: (() => void) | null = null;

  constructor() {
    this.currentUserId = getUserId() || "";
    this.refreshMode();
    window.addEventListener("configUpdate", () => this.refreshMode());
  }

  refreshMode() {
    const newMode = isBackendAvailable() ? "backend" : "mock";
    if (newMode !== this._mode) {
      console.log(`[ChatProxy] Mode changed: ${this._mode} → ${newMode}`);
      this._mockWarningShown = false;
      // Reset IM adapter when config changes
      if (newMode === "backend") {
        resetIMAdapter();
      }
    }
    this._mode = newMode;
    const cfg = getProxyConfig();
    console.log(`[ChatProxy] Running in ${this._mode.toUpperCase()} mode | Provider: ${cfg.chatProvider} | Direct SDK`);
  }

  get mode() {
    this._mode = isBackendAvailable() ? "backend" : "mock";
    return this._mode;
  }

  /** Get current configured chat provider */
  get provider(): ChatProvider {
    return getProxyConfig().chatProvider;
  }

  /** Get provider display info */
  get providerInfo() {
    return CHAT_PROVIDER_INFO[this.provider] ?? CHAT_PROVIDER_INFO['tencent-im'];
  }

  onMessage(listener: (msg: ChatMessage) => void) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private notifyListeners(msg: ChatMessage) {
    this._listeners.forEach((fn) => fn(msg));
  }

  setUserId(userId: string) {
    this.currentUserId = userId;
  }

  /** Set the target user ID for the current chat session */
  setTargetUserId(targetUserId: string) {
    this._targetUserId = targetUserId;
  }

  /** Get the current target user ID */
  get targetUserId(): string | null {
    return this._targetUserId;
  }

  /**
   * Generate a deterministic 1-to-1 channel name from two user IDs.
   * Sorts alphabetically so both sides get the same channel name.
   */
  static generateChannelName(userId1: string, userId2: string): string {
    const sorted = [userId1, userId2].sort();
    return `dm_${sorted[0]}_${sorted[1]}`;
  }

  // ========================================================================
  // MESSAGE RECEIVING — via IM SDK WebSocket (no polling needed)
  // ========================================================================

  /**
   * Start listening for messages. In direct SDK mode, messages arrive via
   * WebSocket push — no polling needed. This method subscribes to the
   * IMAdapter's onMessage callback.
   */
  startPolling(_intervalMs?: number): void {
    this.stopPolling(); // Clear any existing subscription

    if (this._mode === "backend") {
      const adapter = getIMAdapter();
      // Subscribe to incoming messages from SDK
      this._adapterUnsubscribe = adapter.onMessage((incomingMsg) => {
        if (this._seenMessageIds.has(incomingMsg.id)) return;
        this._seenMessageIds.add(incomingMsg.id);
        if (incomingMsg.senderId === this.currentUserId) return;
        this.notifyListeners(incomingMsg);
      });
      console.log('[ChatProxy] Subscribed to IM SDK messages (WebSocket push, no polling)');
    } else {
      console.log("[ChatProxy][MOCK] Mock mode active — no auto-reply simulation. Static display only.");
    }
  }

  /** Stop listening for messages */
  stopPolling(): void {
    if (this._adapterUnsubscribe) {
      this._adapterUnsubscribe();
      this._adapterUnsubscribe = null;
      console.log("[ChatProxy] Unsubscribed from IM SDK messages");
    }
  }

  /** Whether listening is currently active */
  get isPollingActive(): boolean {
    return this._adapterUnsubscribe !== null;
  }

  /** Mark existing message IDs as seen (to prevent duplicates on initial load) */
  markSeen(messageIds: string[]): void {
    for (const id of messageIds) {
      this._seenMessageIds.add(id);
    }
  }

  /**
   * Leave the current channel (disconnect IM SDK).
   * Called automatically before joining a new channel.
   */
  async leaveChannel(): Promise<void> {
    this.stopPolling();
    if (this._mode === "backend") {
      try {
        const adapter = getIMAdapter();
        adapter.disconnect();
        resetIMAdapter();
        console.log(`[ChatProxy] Left channel: ${this.currentChannel}`);
      } catch (err) {
        console.warn('[ChatProxy] leaveChannel error:', err);
      }
    }
    this.currentChannel = "default-channel";
    this._seenMessageIds.clear();
  }

  // ========================================================================
  // JOIN CHANNEL — Connect IM SDK to channel
  // ========================================================================
  async joinChannel(
    channelName: string
  ): Promise<{ token: string; appId: string; uid: string | number }> {
    // Leave previous channel if switching
    if (this.currentChannel !== "default-channel" && this.currentChannel !== channelName) {
      await this.leaveChannel();
    }

    this.currentChannel = channelName;
    const cfg = getProxyConfig();

    if (this._mode === "backend") {
      console.log(`[ChatProxy] Connecting IM SDK to channel: ${channelName} (provider: ${cfg.chatProvider})`);
      const adapter = getIMAdapter();
      await adapter.connect(this.currentUserId, channelName);
      console.log(`[ChatProxy] IM SDK connected to channel: ${channelName}`);
      return { token: 'sdk-direct', appId: cfg.chatProvider, uid: this.currentUserId };
    }

    // Mock mode
    console.log(`[ChatProxy][MOCK] Generating mock token for channel: ${channelName}`);
    await this.simulateLatency(300);
    return {
      token: `mock-token-${Date.now()}`,
      appId: `MOCK_${cfg.chatProvider.toUpperCase()}`,
      uid: this.currentUserId,
    };
  }

  // ========================================================================
  // SEND MESSAGE — via IM SDK direct
  // ========================================================================
  async sendMessage(
    content: string,
    type: "text" | "image" | "voice" = "text",
    duration?: number,
    targetUserId?: string,
    audioBlob?: Blob
  ): Promise<ChatMessage> {
    if (this._mode === "mock" && !this._mockWarningShown) {
      console.warn(
        "[ChatProxy] Backend proxy not enabled. Running in MOCK mode.\n" +
        "Go to ConfigManager → Backend Proxy tab to configure IM provider and enable backend proxy."
      );
      this._mockWarningShown = true;
    }

    const newMessage: ChatMessage = {
      id: `m${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      channelName: this.currentChannel,
      senderId: this.currentUserId,
      content,
      type,
      timestamp: Date.now(),
      status: "sending",
      read: false,
      duration,
    };

    if (this._mode === "backend") {
      try {
        const adapter = getIMAdapter();
        const result = await adapter.sendMessage({
          id: newMessage.id,
          content: newMessage.content,
          type: newMessage.type,
          senderId: newMessage.senderId,
          targetUserId: targetUserId || this._targetUserId || "",
          channelName: this.currentChannel,
          duration: newMessage.duration,
          audioBlob,
        });

        if (result.success) {
          newMessage.status = "sent";
          newMessage.timestamp = result.serverTimestamp || newMessage.timestamp;
          if (result.audioUrl) {
            newMessage.audioUrl = result.audioUrl;
            newMessage.content = result.audioUrl;
          }
        } else {
          newMessage.status = "failed";
          console.error("[ChatProxy] Send failed:", result.error);
        }
        return newMessage;
      } catch (error) {
        console.error("[ChatProxy] Send failed:", error);
        newMessage.status = "failed";
        return newMessage;
      }
    }

    // Mock mode
    await this.simulateLatency(200);
    newMessage.status = "sent";

    // For voice messages in mock mode: create a playable objectURL from the blob
    if (type === "voice" && audioBlob) {
      const objectUrl = URL.createObjectURL(audioBlob);
      newMessage.audioUrl = objectUrl;
      newMessage.content = objectUrl;
    }

    mockMessageStore.push(newMessage);

    // Mock auto-reply
    if (this._targetUserId) {
      this._scheduleMockReply(newMessage);
    }

    return newMessage;
  }

  /**
   * Schedule a mock auto-reply in mock mode.
   */
  private _scheduleMockReply(userMsg: ChatMessage): void {
    const delay = 1000 + Math.random() * 2000;
    const mockReplies: Record<string, string[]> = {
      text: [
        "好的，收到了！",
        "没问题，我马上处理",
        "这个产品目前有货，需要我帮你预留吗？",
        "价格方面可以再商量",
        "OK, received!",
        "I'll check and get back to you",
        "Yes, this product is available",
      ],
      image: [
        "图片收到了，我看看",
        "Product photo received, let me check",
      ],
      voice: [
        "语音已收听",
        "Voice message received",
      ],
    };

    const replies = mockReplies[userMsg.type] || mockReplies.text;
    const replyContent = replies[Math.floor(Math.random() * replies.length)];

    setTimeout(() => {
      const replyMsg: ChatMessage = {
        id: `mock_reply_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        channelName: this.currentChannel,
        senderId: this._targetUserId || "",
        content: replyContent,
        type: "text",
        timestamp: Date.now(),
        status: "sent",
        read: false,
      };
      this.notifyListeners(replyMsg);
      console.log(`[ChatProxy][MOCK] Auto-reply from ${this._targetUserId}: "${replyContent}"`);
    }, delay);
  }

  // ========================================================================
  // GET HISTORY — via IM SDK
  // ========================================================================
  async getHistory(channelName: string): Promise<ChatMessage[]> {
    if (this._mode === "backend") {
      const adapter = getIMAdapter();
      return adapter.getHistory(channelName);
    }

    // Mock mode
    await this.simulateLatency(500);
    return mockMessageStore.filter((m) => m.channelName === channelName);
  }

  // ---- Helpers ----
  private simulateLatency(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton export
export const chatService = new ChatProxyService();