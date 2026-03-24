import React from "react";
import { Play, Pause, AlertCircle } from "lucide-react";
import { type ChatMessage } from "../../../services/ChatProxyService";

// 避免触摸后 click 再次触发导致 TTS 重复播放
const lastTouchTs = { current: 0 };

interface MessageBubbleProps {
  msg: ChatMessage;
  currentUserId: string;
  isPlaying: boolean;
  isRTL: boolean;
  onTogglePlay: (id: string, duration: number) => void;
  onTextClick: (text: string) => void;
  onImageClick?: (src: string) => void;
}

export const MessageBubble = React.memo(({
  msg,
  currentUserId,
  isPlaying,
  isRTL,
  onTogglePlay,
  onTextClick,
  onImageClick,
}: MessageBubbleProps) => {
  const isSent = msg.senderId === currentUserId;
  const isFailed = msg.status === 'failed';

  const bubble = (
    <div className="relative max-w-[85%]">
      <div className={`rounded-2xl px-3 py-2 ${
        isSent
          ? `bg-emerald-500 text-white ${isRTL ? 'rounded-bl-md' : 'rounded-br-md'}`
          : `bg-gray-100 text-gray-700 ${isRTL ? 'rounded-br-md' : 'rounded-bl-md'}`
      }`}>
        {msg.type === "voice" && (
          <button
            className="flex items-center gap-2 min-w-[80px] w-full"
            onClick={() => onTogglePlay(msg.id, msg.duration || 5)}
          >
            {isPlaying
              ? <Pause className="w-3.5 h-3.5 flex-shrink-0" />
              : <Play className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" />
            }
            <div className="flex items-end gap-[2px] h-4">
              {[1.5, 3, 2, 3.5, 1.5, 3, 2].map((h, i) => (
                <div
                  key={i}
                  className={`w-[3px] rounded-full ${isSent ? 'bg-white/80' : 'bg-gray-500'}`}
                  style={isPlaying ? {
                    height: `${h * 4}px`,
                    animation: `voiceWave 0.4s ease-in-out ${i * 0.07}s infinite alternate`,
                  } : {
                    height: `${h * 4}px`,
                  }}
                />
              ))}
            </div>
            <span className="text-[10px] font-semibold flex-shrink-0">{msg.duration}"</span>
          </button>
        )}
        {msg.type === "text" && (
          <p
            className={`break-words leading-relaxed ${!isSent ? 'cursor-pointer active:opacity-70 select-none touch-manipulation' : ''}`}
            style={{ fontSize: 'clamp(13px, 3.5vw, 15px)' }}
            {...(!isSent && {
              onClick: () => {
                if (Date.now() - lastTouchTs.current < 400) return;
                onTextClick(msg.content);
              },
              onPointerUp: (e: React.PointerEvent) => {
                if (e.pointerType === 'touch') {
                  lastTouchTs.current = Date.now();
                  onTextClick(msg.content);
                }
              },
            })}
          >
            {msg.content}
          </p>
        )}
        {msg.type === "image" && (
          <img
            src={msg.content}
            alt=""
            className="max-w-44 max-h-48 w-auto h-auto rounded-xl cursor-pointer active:opacity-80 transition-opacity"
            loading="lazy"
            onClick={() => onImageClick?.(msg.content)}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className={`flex items-end gap-1.5 ${isSent ? 'justify-end' : 'justify-start'}`}>
      {isSent && isFailed && (
        <div className="flex-shrink-0 mb-0.5">
          <AlertCircle className="w-4 h-4 text-red-500" />
        </div>
      )}
      {bubble}
      {!isSent && isFailed && (
        <div className="flex-shrink-0 mb-0.5">
          <AlertCircle className="w-4 h-4 text-red-500" />
        </div>
      )}
    </div>
  );
});