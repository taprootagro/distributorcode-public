import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from "react";
import { ChevronLeft, Volume2, VolumeX, AlertTriangle } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import { useChatMessages } from "./hooks/useChatMessages";
import { useVoiceSystem } from "./hooks/useVoiceSystem";
import { ChatInputBar } from "./ChatInputBar";
import { MessageBubble } from "./MessageBubble";
import { ImageViewer } from "./ImageViewer";
import { useConfigContext } from "../../hooks/ConfigProvider";
import { type ChatMessage } from "../../services/ChatProxyService";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import type { Conversation } from "./ConversationListPage";

const LazyCallDialog = lazy(() =>
  import("../CallDialog").then((m) => ({ default: m.CallDialog }))
);

type Message = ChatMessage;

function VirtuosoFooter() {
  return <div className="h-2" />;
}

interface ChatDetailPageProps {
  conversation: Conversation;
  onBack: () => void;
}

export function ChatDetailPage({ conversation, onBack }: ChatDetailPageProps) {
  const { isRTL } = useLanguage();
  const { config } = useConfigContext();
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const prev = meta?.getAttribute("content") || "#059669";
    meta?.setAttribute("content", "#059669");
    return () => { meta?.setAttribute("content", prev); };
  }, []);

  const chatTarget = conversation.channelId
    ? { imUserId: conversation.imUserId || conversation.peerId, channelId: conversation.channelId, imProvider: conversation.imProvider }
    : undefined;

  const {
    chatMessages,
    currentUserId,
    isSending,
    connectionError,
    sendTextMessage,
    sendVoiceMessage,
    sendImageMessage,
  } = useChatMessages(config, chatTarget);

  const {
    playingVoiceId,
    ttsEnabled,
    toggleTts,
    toggleVoicePlay,
    handleTextMsgClick,
  } = useVoiceSystem(chatMessages, currentUserId);

  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const [showCallDialog, setShowCallDialog] = useState(false);
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const [callStatus, setCallStatus] = useState<"calling" | "connected" | "ended">("calling");
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [callDialogEverShown, setCallDialogEverShown] = useState(false);

  const handleImageClick = useCallback((src: string) => {
    setViewingImage(src);
  }, []);

  const handleCall = useCallback((type: "audio" | "video") => {
    setCallType(type);
    setCallStatus("calling");
    setShowCallDialog(true);
    setCallDialogEverShown(true);
  }, []);

  const VirtuosoHeader = useMemo(() => {
    return function Header() {
      return <div className="h-2" />;
    };
  }, []);

  const virtuosoComponents = useMemo(
    () => ({ Header: VirtuosoHeader, Footer: VirtuosoFooter }),
    [VirtuosoHeader]
  );

  const renderItem = useCallback(
    (_index: number, msg: Message) => (
      <div className="pb-2.5">
        <MessageBubble
          msg={msg}
          currentUserId={currentUserId}
          isPlaying={playingVoiceId === msg.id}
          isRTL={isRTL}
          onTogglePlay={toggleVoicePlay}
          onTextClick={handleTextMsgClick}
          onImageClick={handleImageClick}
        />
      </div>
    ),
    [currentUserId, playingVoiceId, isRTL, toggleVoicePlay, handleTextMsgClick, handleImageClick]
  );

  const needsCallDialog = callDialogEverShown || showCallDialog;

  return (
    <div className="flex flex-col h-full bg-[#EDEDED]">
      {/* Full-screen image viewer */}
      {viewingImage && (
        <ImageViewer src={viewingImage} onClose={() => setViewingImage(null)} />
      )}

      {/* Call dialog (lazy) */}
      {needsCallDialog && (
        <Suspense fallback={null}>
          <LazyCallDialog
            isOpen={showCallDialog}
            onClose={() => setShowCallDialog(false)}
            contactName={conversation.peerName}
            contactAvatar={conversation.peerAvatar}
            callType={callType}
            callStatus={callStatus}
          />
        </Suspense>
      )}

      {/* IM connection error banner */}
      {connectionError && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 text-xs py-1.5 px-3 flex items-center justify-center gap-1.5 z-40">
          <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
          <span className="truncate">IM connection failed</span>
        </div>
      )}

      {/* ---- Header: back | name (centered) | speaker — green bar matching HomePage ---- */}
      <div className="bg-emerald-600 px-2 py-1.5 flex-shrink-0 shadow-md">
        <div className="flex items-center relative h-10">
          {/* Back button */}
          <button
            className="w-10 h-10 flex items-center justify-center active:scale-95 transition-all rounded-xl active:bg-white/10 z-10"
            onClick={onBack}
          >
            <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2} />
          </button>

          {/* Name centered */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <h2 className="text-[16px] font-semibold text-white truncate max-w-[60%]">
              {conversation.peerName}
            </h2>
          </div>

          {/* Speaker toggle */}
          <div className="ml-auto z-10">
            <button
              className={`w-10 h-10 flex items-center justify-center active:scale-95 transition-all rounded-xl ${
                ttsEnabled ? "active:bg-white/10" : "bg-white/15 active:bg-white/20"
              }`}
              onClick={toggleTts}
            >
              {ttsEnabled ? (
                <Volume2 className="w-5 h-5 text-white" strokeWidth={2} />
              ) : (
                <VolumeX className="w-5 h-5 text-white/50" strokeWidth={2} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ---- Chat area ---- */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 px-4 py-2 min-h-0">
          <Virtuoso
            ref={virtuosoRef}
            data={chatMessages}
            initialTopMostItemIndex={chatMessages.length - 1}
            components={virtuosoComponents}
            itemContent={renderItem}
            followOutput="smooth"
            alignToBottom
          />
        </div>

        {/* Input bar — unchanged */}
        <ChatInputBar
          onSendText={sendTextMessage}
          onSendVoice={sendVoiceMessage}
          onSendImage={sendImageMessage}
          onCall={handleCall}
          isSending={isSending}
        />
      </div>
    </div>
  );
}
