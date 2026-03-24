// ============================================================================
// IMProviderDirectAdapter - Direct IM Provider SDK Mode
// ============================================================================
// Message Flow:
//   SEND: Frontend IM SDK → IM Provider Cloud (WebSocket)
//   RECEIVE: IM Provider Cloud → Frontend IM SDK (WebSocket push)
//   TOKEN: Frontend → Backend token endpoint → IM Provider Token API → Frontend
//
// This mode loads the IM provider's client SDK directly in the browser.
// Messages are sent/received via WebSocket — no polling needed.
// A backend token endpoint is used ONLY for token generation (no message relay).
//
// Pros: Lowest latency, real-time WebSocket, rich SDK features (typing, read receipts)
// Cons: Larger JS bundle (IM SDK), requires client SDK support, more complex
// Best for: High-traffic apps (>5K concurrent), real-time chat requirements
//
// Supported Providers:
//   - CometChat: @cometchat/chat-sdk-javascript (~60KB gzipped)
//   - Tencent IM: @tencentcloud/chat SDK (v3 SDK, ~90KB gzipped)
//
// SDK Loading Strategy:
//   Dynamic import from ESM CDN (esm.sh) to avoid bundling unused SDKs.
//   Only the selected provider's SDK is loaded at runtime.
// ============================================================================

import type { ChatMessage } from './ChatProxyService';
import type { IIMAdapter, IMAdapterConfig } from './IMAdapter';
import type { IMMode } from '../hooks/useHomeConfig';

function dataURLtoFile(dataurl: string, filename: string): File {
  const arr = dataurl.split(',');
  const mime = (arr[0].match(/:(.*?);/)?.[1] || 'image/png').trim();
  const bstr = atob(arr[1] || '');
  const u8arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
  return new File([u8arr], filename, { type: mime });
}

export class IMProviderDirectAdapter implements IIMAdapter {
  readonly mode: IMMode = 'im-provider-direct';
  readonly modeLabel = 'IM Provider Direct (SDK)';

  private _config: IMAdapterConfig;
  private _userId = '';
  private _channelName = '';
  private _connected = false;
  private _simulationMode = false;
  private _listeners = new Set<(msg: ChatMessage) => void>();
  private _sdkInstance: unknown = null;
  private _sdkChannel: unknown = null;
  private _token = '';
  private _timModule: any = null;

  /** Whether this adapter is running in simulation mode (SDK unavailable) */
  get isSimulation(): boolean { return this._simulationMode; }

  constructor(config: IMAdapterConfig) {
    this._config = config;
  }

  get isConnected() { return this._connected; }

  // ---- Token acquisition (via backend token endpoint) ----

  private async _getToken(): Promise<{ token: string; appId: string }> {
    const { supabaseUrl, supabaseAnonKey, chatProvider } = this._config;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const res = await fetch(
          `${supabaseUrl}/functions/v1/chat-token/token`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseAnonKey}`,
              apikey: supabaseAnonKey,
            },
            body: JSON.stringify({
              channelName: this._channelName,
              uid: this._userId,
              provider: chatProvider,
            }),
          }
        );
        if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
        const data = await res.json();
        return { token: data.token, appId: data.appId };
      } catch (err) {
        console.error('[IMDirect] Token acquisition failed:', err);
      }
    }

    // Mock token
    return { token: `mock-token-${Date.now()}`, appId: 'MOCK_APP' };
  }

  // ---- Connect: load SDK + authenticate + subscribe ----

  async connect(userId: string, channelName: string): Promise<void> {
    this._userId = userId;
    this._channelName = channelName;

    const { token, appId } = await this._getToken();
    this._token = token;

    const provider = this._config.chatProvider;

    try {
      switch (provider) {
        case 'cometchat':
          await this._connectCometChat(appId, userId, token, channelName);
          break;
        case 'tencent-im':
          await this._connectTencentIM(appId, userId, token, channelName);
          break;
        default:
          console.warn(`[IMDirect] Unknown provider: ${provider}, running in simulation mode`);
          this._connected = true;
          this._simulationMode = true;
      }
    } catch (err) {
      console.error(`[IMDirect] Failed to connect via ${provider}:`, err);
      if (import.meta.env.DEV) {
        this._connected = true;
        this._simulationMode = true;
        console.warn('[IMDirect] DEV: Running in simulation mode (SDK not available)');
      } else {
        this._connected = false;
        this._simulationMode = false;
        throw new Error(`IM connection failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ---- CometChat ----
  private async _connectCometChat(appId: string, userId: string, token: string, _channelName: string): Promise<void> {
    try {
      const CometChat = await import(
        /* @vite-ignore */
        'https://esm.sh/@cometchat/chat-sdk-javascript@4'
      ).catch(() => null);

      if (!CometChat) {
        if (import.meta.env.DEV) {
          console.warn('[IMDirect][CometChat] SDK not available, DEV simulation mode');
          this._connected = true;
          this._simulationMode = true;
          return;
        }
        throw new Error('CometChat SDK not available');
      }

      const resolvedAppId = appId || this._config.cometchatAppId;
      const region = this._config.cometchatRegion || 'us';

      const appSetting = new CometChat.AppSettingsBuilder()
        .subscribePresenceForAllUsers()
        .setRegion(region)
        .autoEstablishSocketConnection(true)
        .build();

      await CometChat.CometChat.init(resolvedAppId, appSetting);
      await CometChat.CometChat.login(userId, token);

      // Message listener — 支持文字、图片、语音
      const toChatMessage = (m: Record<string, unknown>, type: 'text' | 'image' | 'voice', content: string, extra?: Partial<ChatMessage>): ChatMessage => ({
        id: String(m.id || `cc_${Date.now()}`),
        channelName: _channelName,
        senderId: String((m as Record<string, unknown>).sender?.uid || ''),
        content,
        type,
        timestamp: Number(m.sentAt) ? Number(m.sentAt) * 1000 : Date.now(),
        status: 'sent' as const,
        read: false,
        ...extra,
      });

      CometChat.CometChat.addMessageListener(
        'taproot-listener',
        new CometChat.CometChat.MessageListener({
          onTextMessageReceived: (message: Record<string, unknown>) => {
            if (String((message as Record<string, unknown>).sender?.uid) === this._userId) return;
            this._listeners.forEach(fn => fn(toChatMessage(message, 'text', String((message as Record<string, unknown>).text || ''))));
          },
          onMediaMessageReceived: (message: Record<string, unknown>) => {
            if (String((message as Record<string, unknown>).sender?.uid) === this._userId) return;
            const meta = (message as any).metadata || {};
            const att = (message as any).attachments?.[0];
            const url = att?.url || (message as any).url || meta.url || '';
            const msgType = ((message as any).type || att?.fileType || '').toLowerCase().includes('audio') ? 'voice' : 'image';
            const duration = meta.duration ?? att?.duration ?? 0;
            const extra = msgType === 'voice' ? { duration: Number(duration), audioUrl: url || undefined } : {};
            this._listeners.forEach(fn => fn(toChatMessage(message, msgType, url || '[Media]', extra)));
          },
        })
      );

      this._sdkInstance = CometChat;
      this._connected = true;
      console.log(`[IMDirect][CometChat] Connected: ${_channelName}`);
    } catch (err) {
      console.error('[IMDirect][CometChat] Connection error:', err);
      if (import.meta.env.DEV) {
        this._connected = true;
        this._simulationMode = true;
      } else {
        throw err;
      }
    }
  }

  // ---- Tencent IM ----
  // SDK: @tencentcloud/chat (v3+)
  // Docs: https://cloud.tencent.com/document/product/269/75285
  // CDN:  https://esm.sh/@tencentcloud/chat
  //
  // Auth flow:
  //   1. Edge Function generates UserSig (HMAC-SHA256 with SecretKey)
  //   2. Frontend calls chat.login({ userID, userSig })
  //   3. SDK establishes WebSocket to Tencent Cloud
  //
  // Message flow (C2C — 1-to-1):
  //   SEND:    chat.createTextMessage() → chat.sendMessage()
  //   RECEIVE: SDK EVENT.MESSAGE_RECEIVED → callback
  //
  // Group chat:
  //   channelName is treated as groupID; SDK joins group automatically
  //   if the user was added server-side, or we call joinGroup().

  private async _connectTencentIM(appId: string, userId: string, userSig: string, channelName: string): Promise<void> {
    try {
      // ---- Step 1: Dynamic import from ESM CDN ----
      const TencentCloudChat = await import(
        /* @vite-ignore */
        'https://esm.sh/@tencentcloud/chat'
      ).catch(() => null);

      if (!TencentCloudChat) {
        if (import.meta.env.DEV) {
          console.warn('[IMDirect][TencentIM] SDK not available from CDN, DEV simulation mode');
          this._connected = true;
          this._simulationMode = true;
          return;
        }
        throw new Error('Tencent IM SDK not available');
      }

      // The SDK exports `default` as the main class
      const ChatSDK = TencentCloudChat.default || TencentCloudChat;
      this._timModule = ChatSDK;

      // ---- Step 2: Create SDK instance ----
      const resolvedAppId = Number(appId) || Number(this._config.tencentAppId);
      if (!resolvedAppId) {
        const msg = '[IMDirect][TencentIM] Invalid SDKAppID — check ConfigManager → Backend Proxy → tencentAppId';
        console.error(msg);
        if (import.meta.env.DEV) {
          this._connected = true;
          this._simulationMode = true;
          return;
        }
        throw new Error(msg);
      }

      const chat = ChatSDK.create({
        SDKAppID: resolvedAppId,
      });

      this._sdkInstance = chat;

      // ---- Step 3: Register event listeners BEFORE login ----

      // 3a. SDK Ready — resolve login only after SDK is fully ready
      const sdkReadyPromise = new Promise<void>((resolve) => {
        const onReady = () => {
          console.log('[IMDirect][TencentIM] SDK ready');
          resolve();
        };
        // Use the enum from the SDK if available, otherwise fallback constant
        const readyEvent = ChatSDK.EVENT?.SDK_READY || 'onSdkReady';
        chat.on(readyEvent, onReady);
      });

      // 3b. Message received
      const msgEvent = ChatSDK.EVENT?.MESSAGE_RECEIVED || 'onMessageReceived';
      chat.on(msgEvent, (event: { data: any[] }) => {
        const messageList: any[] = event.data || [];
        for (const timMsg of messageList) {
          // Skip own messages
          if (timMsg.from === this._userId) continue;
          // Only process messages for the current channel/conversation
          // C2C: conversationID = `C2C${from}`, Group: conversationID = `GROUP${groupID}`
          const isRelevant =
            timMsg.conversationID === `C2C${this._userId}` || // incoming C2C to me
            timMsg.conversationID === `GROUP${channelName}` || // group message
            timMsg.to === this._userId; // direct match

          if (!isRelevant) continue;

          // Extract content based on message type
          let content = '';
          let msgType: 'text' | 'image' | 'voice' = 'text';

          if (timMsg.type === (ChatSDK.TYPES?.MSG_TEXT || 'TIMTextElem')) {
            content = timMsg.payload?.text || '';
            msgType = 'text';
          } else if (timMsg.type === (ChatSDK.TYPES?.MSG_IMAGE || 'TIMImageElem')) {
            // Image: use the first available URL from imageInfoArray
            const imageInfo = timMsg.payload?.imageInfoArray?.[0];
            content = imageInfo?.url || imageInfo?.imageUrl || '[Image]';
            msgType = 'image';
          } else if (timMsg.type === (ChatSDK.TYPES?.MSG_AUDIO || 'TIMSoundElem')) {
            content = timMsg.payload?.remoteAudioUrl || timMsg.payload?.url || '[Voice]';
            msgType = 'voice';
          } else if (timMsg.type === (ChatSDK.TYPES?.MSG_CUSTOM || 'TIMCustomElem')) {
            content = timMsg.payload?.data || '';
            msgType = 'text';
          } else {
            // Other types (video, file, etc.) — pass as text with description
            content = timMsg.payload?.text || timMsg.payload?.data || `[${timMsg.type}]`;
          }

          const chatMsg: ChatMessage = {
            id: timMsg.ID || `tim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            channelName,
            senderId: String(timMsg.from || ''),
            content,
            type: msgType,
            timestamp: (timMsg.time ? timMsg.time * 1000 : Date.now()), // TIM uses seconds
            status: 'sent',
            read: false,
            // For voice messages, set audioUrl explicitly for playback
            ...(msgType === 'voice' && content !== '[Voice]' ? { audioUrl: content } : {}),
          };

          this._listeners.forEach(fn => fn(chatMsg));
        }
      });

      // 3c. Network state change (for logging/diagnostics)
      const netEvent = ChatSDK.EVENT?.NET_STATE_CHANGE || 'onNetStateChange';
      chat.on(netEvent, (event: { data: { state: string } }) => {
        console.log(`[IMDirect][TencentIM] Network state: ${event.data?.state}`);
      });

      // 3d. Kicked out (another device logged in with same userID)
      const kickedEvent = ChatSDK.EVENT?.KICKED_OUT || 'onKickedOut';
      chat.on(kickedEvent, (event: { data: { type: string } }) => {
        console.warn(`[IMDirect][TencentIM] Kicked out: ${event.data?.type}`);
        this._connected = false;
      });

      // ---- Step 4: Login ----
      const loginRes = await chat.login({ userID: userId, userSig: userSig });
      if (loginRes.code !== 0) {
        const errMsg = `[IMDirect][TencentIM] Login failed: code=${loginRes.code}, message=${loginRes.message}`;
        console.error(errMsg);
        if (import.meta.env.DEV) {
          this._connected = true;
          this._simulationMode = true;
          return;
        }
        throw new Error(errMsg);
      }

      console.log(`[IMDirect][TencentIM] Login successful, userID=${userId}`);

      // Wait for SDK ready (usually instant after login, but can be delayed on slow networks)
      await Promise.race([
        sdkReadyPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 10000)), // 10s timeout
      ]);

      // ---- Step 5: Join group if channelName looks like a group ID ----
      // Convention: if channelName starts with '@TGS#' or is a custom group ID,
      // it's a group conversation. Otherwise treat as C2C.
      if (channelName && channelName !== userId) {
        try {
          await chat.joinGroup({ groupID: channelName });
          console.log(`[IMDirect][TencentIM] Joined group: ${channelName}`);
        } catch (joinErr: any) {
          // Code 10013 = already in group — not an error
          if (joinErr?.code === 10013 || joinErr?.message?.includes('already')) {
            console.log(`[IMDirect][TencentIM] Already in group: ${channelName}`);
          } else {
            // Non-fatal: group may not exist yet, or this is C2C mode
            console.warn(`[IMDirect][TencentIM] joinGroup skipped (may be C2C mode):`, joinErr?.message || joinErr);
          }
        }
      }

      this._connected = true;
      console.log(`[IMDirect][TencentIM] Connected: channel=${channelName}, SDKAppID=${resolvedAppId}`);
    } catch (err) {
      console.error('[IMDirect][TencentIM] Connection error:', err);
      if (import.meta.env.DEV) {
        this._connected = true;
        this._simulationMode = true;
      } else {
        throw err;
      }
    }
  }

  // ---- Disconnect ----

  disconnect(): void {
    const provider = this._config.chatProvider;

    try {
      if (provider === 'cometchat' && this._sdkInstance) {
        const CometChat = this._sdkInstance as Record<string, Record<string, (...args: unknown[]) => void>>;
        CometChat.CometChat?.removeMessageListener?.('taproot-listener');
        CometChat.CometChat?.logout?.();
      } else if (provider === 'tencent-im' && this._sdkInstance) {
        const chat = this._sdkInstance as Record<string, (...args: unknown[]) => Promise<unknown>>;
        // Logout gracefully — this closes the WebSocket connection
        chat.logout?.()
          .then(() => console.log('[IMDirect][TencentIM] Logged out'))
          .catch((err: unknown) => console.warn('[IMDirect][TencentIM] Logout error:', err));
        // Note: do NOT call chat.destroy() — it's a singleton, destroying
        // prevents reconnection without a full page reload.
      }
    } catch (err) {
      console.warn('[IMDirect] Disconnect error:', err);
    }

    this._sdkInstance = null;
    this._sdkChannel = null;
    this._timModule = null;
    this._connected = false;
    this._listeners.clear();
    console.log(`[IMDirect] Disconnected (${provider})`);
  }

  // ---- Send Message ----

  async sendMessage(msg: {
    id: string;
    content: string;
    type: 'text' | 'image' | 'voice';
    senderId: string;
    targetUserId: string;
    channelName: string;
    duration?: number;
    audioBlob?: Blob;
  }): Promise<{ success: boolean; serverTimestamp?: number; audioUrl?: string; error?: string }> {
    const provider = this._config.chatProvider;

    // If SDK is connected, send via SDK
    if (provider === 'cometchat' && this._sdkInstance) {
      try {
        const CC = this._sdkInstance as any;
        const CometChat = CC.CometChat || CC;
        const MESSAGE_TYPE = CC.MESSAGE_TYPE || CC.CometChat?.MESSAGE_TYPE || {};
        const RECEIVER_TYPE = CC.RECEIVER_TYPE || CC.CometChat?.RECEIVER_TYPE || { USER: 'user' };
        const receiverType = RECEIVER_TYPE.USER || 'user';

        if (msg.type === 'text') {
          const TextMessage = CometChat.TextMessage;
          const textMessage = new TextMessage(msg.targetUserId, msg.content, receiverType);
          await CometChat.sendMessage(textMessage);
          return { success: true, serverTimestamp: Date.now() };
        }

        if (msg.type === 'image') {
          let file: File | null = null;
          if (msg.content.startsWith('data:')) {
            file = dataURLtoFile(msg.content, 'image.png');
          } else if (msg.content.startsWith('http')) {
            const res = await fetch(msg.content);
            const blob = await res.blob();
            file = new File([blob], 'image.png', { type: blob.type || 'image/png' });
          }
          if (!file) return { success: false, error: 'Invalid image content' };
          const MediaMessage = CometChat.MediaMessage;
          const mediaMessage = new MediaMessage(msg.targetUserId, file, MESSAGE_TYPE.IMAGE || 'image', receiverType);
          await CometChat.sendMediaMessage(mediaMessage);
          return { success: true, serverTimestamp: Date.now() };
        }

        if (msg.type === 'voice' && msg.audioBlob) {
          const file = new File([msg.audioBlob], 'voice.ogg', { type: msg.audioBlob.type || 'audio/ogg' });
          const MediaMessage = CometChat.MediaMessage;
          const mediaMessage = new MediaMessage(msg.targetUserId, file, MESSAGE_TYPE.AUDIO || 'audio', receiverType);
          if (msg.duration != null && typeof (mediaMessage as any).setMetadata === 'function') {
            (mediaMessage as any).setMetadata({ duration: msg.duration });
          }
          await CometChat.sendMediaMessage(mediaMessage);
          return { success: true, serverTimestamp: Date.now() };
        }

        return { success: false, error: 'Unsupported message type or missing audioBlob' };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[IMDirect][CometChat] Send failed:', err);
        return { success: false, error: errMsg };
      }
    }

    // ---- Tencent IM: send via SDK if connected ----
    if (provider === 'tencent-im' && this._sdkInstance && this._timModule) {
      try {
        const chat = this._sdkInstance as any;
        const ChatSDK = this._timModule;

        // Determine conversation type: group or C2C
        const isGroup = msg.channelName && msg.channelName !== msg.targetUserId;
        const conversationType = isGroup
          ? (ChatSDK.TYPES?.CONV_GROUP || 'GROUP')
          : (ChatSDK.TYPES?.CONV_C2C || 'C2C');
        const to = isGroup ? msg.channelName : msg.targetUserId;

        let timMessage: any;

        switch (msg.type) {
          case 'text':
            timMessage = chat.createTextMessage({
              to,
              conversationType,
              payload: { text: msg.content },
            });
            break;

          case 'image':
            // If content is a URL or base64, send as custom message with image data
            // (True image upload requires File/Blob — base64 strings go via custom message)
            if (msg.content.startsWith('data:') || msg.content.startsWith('http')) {
              timMessage = chat.createCustomMessage({
                to,
                conversationType,
                payload: {
                  data: JSON.stringify({ type: 'image', url: msg.content }),
                  description: '[Image]',
                  extension: 'image',
                },
              });
            } else {
              // Plain text fallback
              timMessage = chat.createTextMessage({
                to,
                conversationType,
                payload: { text: msg.content || '[Image]' },
              });
            }
            break;

          case 'voice':
            // Voice messages: prefer native createAudioMessage if blob is available
            if (msg.audioBlob && typeof chat.createAudioMessage === 'function') {
              try {
                // Convert Blob to File (required by TIM SDK)
                const audioFile = new File(
                  [msg.audioBlob],
                  `voice_${Date.now()}.webm`,
                  { type: msg.audioBlob.type || 'audio/webm' }
                );
                timMessage = chat.createAudioMessage({
                  to,
                  conversationType,
                  payload: {
                    file: audioFile,
                  },
                });
              } catch (audioErr) {
                console.warn('[IMDirect][TencentIM] createAudioMessage failed, falling back to custom message:', audioErr);
                // Fallback to custom message
                timMessage = chat.createCustomMessage({
                  to,
                  conversationType,
                  payload: {
                    data: JSON.stringify({
                      type: 'voice',
                      url: msg.content,
                      duration: msg.duration || 0,
                    }),
                    description: `[Voice ${msg.duration || 0}s]`,
                    extension: 'voice',
                  },
                });
              }
            } else {
              // No blob available — send as custom message with URL
              timMessage = chat.createCustomMessage({
                to,
                conversationType,
                payload: {
                  data: JSON.stringify({
                    type: 'voice',
                    url: msg.content,
                    duration: msg.duration || 0,
                  }),
                  description: `[Voice ${msg.duration || 0}s]`,
                  extension: 'voice',
                },
              });
            }
            break;

          default:
            timMessage = chat.createTextMessage({
              to,
              conversationType,
              payload: { text: msg.content },
            });
        }

        const sendRes = await chat.sendMessage(timMessage);
        if (sendRes.code !== 0) {
          console.error(`[IMDirect][TencentIM] Send failed: code=${sendRes.code}, msg=${sendRes.message}`);
          return { success: false, error: sendRes.message || `TIM error ${sendRes.code}` };
        }

        // Extract server timestamp from the sent message
        const serverTime = sendRes.data?.message?.time
          ? sendRes.data.message.time * 1000
          : Date.now();

        // For audio messages, extract the remote URL from the sent message
        let audioUrl: string | undefined;
        if (msg.type === 'voice' && sendRes.data?.message?.payload) {
          audioUrl = sendRes.data.message.payload.remoteAudioUrl
            || sendRes.data.message.payload.url;
        }

        return { success: true, serverTimestamp: serverTime, audioUrl };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[IMDirect][TencentIM] Send failed:', err);
        return { success: false, error: errMsg };
      }
    }

    // Mock (no SDK connected)
    console.log(`[IMDirect][MOCK] Simulated send via ${provider}:`, msg.content);
    return { success: true, serverTimestamp: Date.now() };
  }

  // ---- History ----

  async getHistory(channelName: string, limit = 50): Promise<ChatMessage[]> {
    const provider = this._config.chatProvider;

    // ---- Tencent IM: fetch history via SDK if available ----
    if (provider === 'tencent-im' && this._sdkInstance && this._timModule) {
      try {
        const chat = this._sdkInstance as any;
        const ChatSDK = this._timModule;

        // Determine conversation ID
        const isGroup = channelName && channelName !== this._userId;
        const conversationID = isGroup ? `GROUP${channelName}` : `C2C${channelName}`;

        const res = await chat.getMessageList({
          conversationID,
          count: limit,
        });

        if (res.code === 0 && res.data?.messageList) {
          return res.data.messageList.map((timMsg: any) => {
            let content = '';
            let msgType: 'text' | 'image' | 'voice' = 'text';

            if (timMsg.type === (ChatSDK.TYPES?.MSG_TEXT || 'TIMTextElem')) {
              content = timMsg.payload?.text || '';
            } else if (timMsg.type === (ChatSDK.TYPES?.MSG_IMAGE || 'TIMImageElem')) {
              const imageInfo = timMsg.payload?.imageInfoArray?.[0];
              content = imageInfo?.url || '[Image]';
              msgType = 'image';
            } else if (timMsg.type === (ChatSDK.TYPES?.MSG_AUDIO || 'TIMSoundElem')) {
              content = timMsg.payload?.remoteAudioUrl || '[Voice]';
              msgType = 'voice';
            } else if (timMsg.type === (ChatSDK.TYPES?.MSG_CUSTOM || 'TIMCustomElem')) {
              try {
                const customData = JSON.parse(timMsg.payload?.data || '{}');
                content = customData.url || customData.text || timMsg.payload?.description || '';
                msgType = customData.type === 'image' ? 'image' : customData.type === 'voice' ? 'voice' : 'text';
              } catch {
                content = timMsg.payload?.data || '';
              }
            } else {
              content = `[${timMsg.type}]`;
            }

            return {
              id: timMsg.ID || `tim_hist_${timMsg.time}`,
              channelName,
              senderId: String(timMsg.from || ''),
              content,
              type: msgType,
              timestamp: timMsg.time ? timMsg.time * 1000 : 0,
              status: 'sent' as const,
              read: true,
              ...(msgType === 'voice' && content !== '[Voice]' ? { audioUrl: content } : {}),
            };
          });
        }
      } catch (err) {
        console.warn('[IMDirect][TencentIM] History fetch via SDK failed:', err);
      }
    }

    // ---- CometChat: fetch history via SDK if available ----
    if (provider === 'cometchat' && this._sdkInstance) {
      try {
        const CC = this._sdkInstance as any;
        const CometChat = CC.CometChat || CC;

        const messagesRequest = new CometChat.MessagesRequestBuilder()
          .setUID(channelName)
          .setLimit(limit)
          .build();

        const messages: any[] = await messagesRequest.fetchPrevious();
        return (messages || []).map((m: any) => {
          const sender = m.sender?.uid || m.senderId || '';
          let content = '';
          let msgType: 'text' | 'image' | 'voice' = 'text';
          let extra: Partial<ChatMessage> = {};

          if (m.type === 'text') {
            content = m.text || '';
            msgType = 'text';
          } else if (m.type === 'image' || m.type === 'file') {
            const att = m.attachments?.[0];
            content = att?.url || m.url || '[Media]';
            msgType = 'image';
          } else if (m.type === 'audio') {
            const att = m.attachments?.[0];
            content = att?.url || m.url || '[Voice]';
            msgType = 'voice';
            extra = { duration: m.metadata?.duration ?? 0, audioUrl: content !== '[Voice]' ? content : undefined };
          }

          return {
            id: String(m.id || `cc_hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
            channelName,
            senderId: String(sender),
            content,
            type: msgType,
            timestamp: m.sentAt ? m.sentAt * 1000 : Date.now(),
            status: 'sent' as const,
            read: true,
            ...extra,
          };
        });
      } catch (err) {
        console.warn('[IMDirect][CometChat] History fetch failed:', err);
      }
    }

    return [];
  }

  onMessage(listener: (msg: ChatMessage) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}