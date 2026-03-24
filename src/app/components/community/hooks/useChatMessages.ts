import { useState, useEffect, useCallback } from "react";
import { chatService, type ChatMessage } from "../../../services/ChatProxyService";
import { chatUserService } from "../../../services/ChatUserService";

export interface ChatTarget {
  imUserId: string;
  channelId: string;
  imProvider?: string;
}

export function useChatMessages(config: any, target?: ChatTarget) {
  const currentUserId = chatUserService.getUserId();
  
  const [proxyMode, setProxyMode] = useState<"backend" | "mock">("mock");
  const [providerName, setProviderName] = useState("");

  const targetImUserId = target?.imUserId || config?.chatContact?.imUserId || "";
  const channelId = target?.channelId || config?.chatContact?.channelId || "";
  const targetId = targetImUserId;

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // ---- Generic optimistic send helper ----
  const sendWithOptimisticUpdate = useCallback(
    async (
      msgOverrides: Partial<ChatMessage> & { type: ChatMessage['type'] },
      serviceSend: () => Promise<ChatMessage>,
      opts?: { setLoading?: boolean }
    ) => {
      if (opts?.setLoading) setIsSending(true);

      const optimisticMsg: ChatMessage = {
        id: `m${Date.now()}_opt`,
        channelName: "default-channel",
        senderId: currentUserId,
        content: "",
        timestamp: Date.now(),
        status: "sending",
        read: false,
        ...msgOverrides,
      };

      setChatMessages((prev) => [...prev, optimisticMsg]);

      try {
        const sentMsg = await serviceSend();
        setChatMessages((prev) =>
          prev.map((m) => (m.id === optimisticMsg.id ? { ...sentMsg } : m))
        );
      } catch {
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticMsg.id ? { ...m, status: "failed" as const } : m
          )
        );
      } finally {
        if (opts?.setLoading) setIsSending(false);
      }
    },
    [currentUserId]
  );

  useEffect(() => {
    chatService.setUserId(currentUserId);
    setProxyMode(chatService.mode);
    setProviderName(chatService.providerInfo.name);
    chatService.setTargetUserId(targetImUserId);

    if (!channelId || channelId === "your-channel-id") {
      console.log("[Community] No channelId bound yet — waiting for QR scan");
      return;
    }

    console.log(`[Community] Channel: ${channelId} (me: ${currentUserId} → target: ${targetImUserId})`);
    setConnectionError(null);

    const init = async () => {
      const regResult = await chatUserService.registerOnProvider();
      if (regResult.success) {
        console.log(`[Community] User ${currentUserId} registered on ${chatService.provider}`);
      } else {
        console.warn(`[Community] User registration issue: ${regResult.error}`);
      }

      try {
        await chatService.joinChannel(channelId);
        console.log(`[Community] Joined channel: ${channelId}`);
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        console.warn(`[Community] joinChannel failed:`, errMsg);
        setConnectionError(errMsg);
      }

      // Load message history from IM SDK
      try {
        const history = await chatService.getHistory(channelId);
        if (history.length > 0) {
          setChatMessages(history);
          chatService.markSeen(history.map(m => m.id));
          console.log(`[Community] Loaded ${history.length} history messages`);
        }
      } catch (err) {
        console.warn(`[Community] getHistory failed:`, err);
      }

      chatService.startPolling();
    };
    init();

    const unsubscribe = chatService.onMessage((incomingMsg) => {
      setChatMessages((prev) => [...prev, incomingMsg]);
    });

    return () => {
      unsubscribe();
      chatService.stopPolling();
    };
  }, [currentUserId, channelId, targetImUserId]);

  const sendTextMessage = useCallback(async (content: string) => {
    await sendWithOptimisticUpdate(
      { type: "text", content },
      () => chatService.sendMessage(content, "text", undefined, targetId),
      { setLoading: true }
    );
  }, [sendWithOptimisticUpdate, targetId]);

  const sendVoiceMessage = useCallback(async (duration: number, audioBlob: Blob) => {
    // Create a local objectURL for immediate playback in the optimistic message
    const localAudioUrl = URL.createObjectURL(audioBlob);
    await sendWithOptimisticUpdate(
      { type: "voice", content: localAudioUrl, duration, audioUrl: localAudioUrl },
      () => chatService.sendMessage("", "voice", duration, targetId, audioBlob),
    );
  }, [sendWithOptimisticUpdate, targetId]);

  const sendImageMessage = useCallback(async (imageData: string) => {
    let compressed = imageData;
    try {
      const { compressImageBase64, COMPRESS_PRESETS } = await import('../../../utils/imageCompressor');
      compressed = await compressImageBase64(imageData, COMPRESS_PRESETS.chat);
    } catch (err) {
      console.warn('[Chat] Image compression failed, using original', err);
    }

    await sendWithOptimisticUpdate(
      { type: "image", content: compressed },
      () => chatService.sendMessage(compressed, "image", undefined, targetId),
    );
  }, [sendWithOptimisticUpdate, targetId]);

  return {
    chatMessages,
    proxyMode,
    providerName,
    currentUserId,
    isSending,
    connectionError,
    sendTextMessage,
    sendVoiceMessage,
    sendImageMessage,
  };
}