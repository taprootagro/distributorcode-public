import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Plus, Mic, PenLine, Phone, Video, Send, Camera, MicOff } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import { useVoiceRecorder } from "./hooks/useVoiceRecorder";

interface ChatInputBarProps {
  onSendText: (text: string) => void;
  onSendVoice: (duration: number, audioBlob: Blob) => void;
  onSendImage: (base64: string) => void;
  onCall: (type: "audio" | "video") => void;
  isSending: boolean;
}

// 录音波形条高度在组件首次挂载时随机生成一次，
// 之后用 CSS animation 做动画，避免每次 setRecordingTime 触发 layout 重算
const WAVE_HEIGHTS = Array.from({ length: 6 }, () => 6 + Math.random() * 10);

export const ChatInputBar = React.memo(function ChatInputBar({
  onSendText,
  onSendVoice,
  onSendImage,
  onCall,
  isSending,
}: ChatInputBarProps) {
  const { t, isRTL } = useLanguage();

  const [textMessage, setTextMessage] = useState("");
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [showPlusMenu, setShowPlusMenu] = useState(false);

  // 使用提取的录音Hook
  const {
    isRecording,
    recordingTime,
    isRecordingRef,
    isCancelPending,
    isCancelPendingRef,
    micPermissionDenied,
    startRecording,
    stopRecording,
    cancelRecording,
    setCancelPending,
  } = useVoiceRecorder(onSendVoice);

  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const cameraCaptureRef = useRef<HTMLInputElement>(null);

  // 点击菜单外部关闭
  useEffect(() => {
    if (!showPlusMenu) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.plus-menu-container')) {
        setShowPlusMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showPlusMenu]);

  // 输入框聚焦处理 — 阻止原生 scrollIntoView
  const handleInputFocus = useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
    });
  }, []);

  const handleSendText = useCallback(() => {
    if (textMessage.trim() && !isSending) {
      const content = textMessage.trim();
      setTextMessage("");
      if (textInputRef.current) {
        textInputRef.current.style.height = '44px';
      }
      onSendText(content);
    }
  }, [textMessage, isSending, onSendText]);

  const handleCameraFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (cameraCaptureRef.current) cameraCaptureRef.current.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      if (base64) onSendImage(base64);
    };
    reader.readAsDataURL(file);
  }, [onSendImage]);

  // 波形条 style 对象 — useMemo 避免每次录音 tick 重建
  const waveBarStyles = useMemo(() =>
    WAVE_HEIGHTS.map((h, i) => ({
      height: `${h}px`,
      animation: `voiceWave 0.4s ease-in-out ${i * 0.07}s infinite alternate`,
    })),
  []);

  return (
    <div className="px-3 py-3 bg-gradient-to-t from-gray-50 to-white flex-shrink-0 relative" style={{ boxShadow: '0 -1px 8px rgba(0,0,0,0.06)' }}>
      <input ref={cameraCaptureRef} type="file" accept="image/*" capture="environment" onChange={handleCameraFile} className="hidden" />

      <div className="flex items-end gap-2">
        {/* 加号菜单 */}
        <div className="relative flex-shrink-0 plus-menu-container">
          <button
            onClick={() => setShowPlusMenu(!showPlusMenu)}
            className={`w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition-all flex-shrink-0 ${showPlusMenu ? 'bg-emerald-50' : 'bg-gray-100'}`}
          >
            <Plus className={`w-5 h-5 transition-transform ${showPlusMenu ? 'rotate-45 text-emerald-600' : 'text-gray-500'}`} strokeWidth={2.5} />
          </button>
          {showPlusMenu && (
            <div className={`absolute bottom-full mb-2.5 bg-white rounded-2xl py-2 z-20 w-[60px] ${isRTL ? 'right-0' : 'left-0'}`} style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              <button onClick={() => { setInputMode('text'); setShowPlusMenu(false); }} className="w-full px-2 py-2 flex items-center justify-center active:bg-gray-50 transition-colors">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center active:scale-95 transition-transform ${inputMode === 'text' ? 'bg-emerald-600' : 'bg-emerald-500'}`}>
                  <PenLine className="w-[18px] h-[18px] text-white" strokeWidth={2.5} />
                </div>
              </button>
              <div className="h-px bg-gray-100 my-1.5 mx-2.5" />
              <button disabled className="w-full px-2 py-2 flex items-center justify-center opacity-40 cursor-not-allowed">
                <div className="w-10 h-10 rounded-xl bg-gray-400 flex items-center justify-center">
                  <Phone className="w-[18px] h-[18px] text-white" strokeWidth={2.5} />
                </div>
              </button>
              <div className="h-px bg-gray-100 my-1.5 mx-2.5" />
              <button disabled className="w-full px-2 py-2 flex items-center justify-center opacity-40 cursor-not-allowed">
                <div className="w-10 h-10 rounded-xl bg-gray-400 flex items-center justify-center">
                  <Video className="w-[18px] h-[18px] text-white" strokeWidth={2.5} />
                </div>
              </button>
              <div className={`absolute -bottom-1.5 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white ${isRTL ? 'right-4' : 'left-4'}`}></div>
            </div>
          )}
        </div>

        {/* 切换语音模式按钮 */}
        {inputMode === 'text' && (
          <button
            onClick={() => setInputMode('voice')}
            className="w-11 h-11 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-full active:scale-90 transition-all flex-shrink-0"
          >
            <Mic className="w-[18px] h-[18px]" />
          </button>
        )}

        {/* 语音模式 */}
        {inputMode === 'voice' && (
          <div
            className="flex-1 min-w-0 select-none"
            style={{ height: '44px' }}
            onTouchStart={(e) => {
              if (isRecordingRef.current || micPermissionDenied) return;
              const touch = e.touches[0];
              const rect = e.currentTarget.getBoundingClientRect();
              (e.currentTarget as any).__startY = touch?.clientY || 0;
              (e.currentTarget as any).__btnRect = rect;
              startRecording();
            }}
            onTouchMove={(e) => {
              if (!isRecordingRef.current) return;
              const touch = e.touches[0];
              const rect = (e.currentTarget as any).__btnRect as DOMRect;
              if (!rect || !touch) return;
              // Check if finger is outside the button area (with 20px tolerance)
              const isOutside =
                touch.clientX < rect.left - 20 ||
                touch.clientX > rect.right + 20 ||
                touch.clientY < rect.top - 20 ||
                touch.clientY > rect.bottom + 20;
              if (isOutside !== isCancelPendingRef.current) {
                setCancelPending(isOutside);
              }
            }}
            onTouchEnd={() => {
              // ★ 始终调用 stopRecording — 处理权限弹窗打断 + 正常停止两种情况
              stopRecording();
            }}
            onTouchCancel={() => cancelRecording()}
            onMouseDown={() => { if (!isRecordingRef.current && !micPermissionDenied) startRecording(); }}
            onMouseUp={() => {
              // ★ 始终调用 stopRecording
              stopRecording();
            }}
            onMouseLeave={() => {
              if (isRecordingRef.current) {
                setCancelPending(true);
              }
              stopRecording();
            }}
          >
            {micPermissionDenied ? (
              <div className="bg-red-50 rounded-full text-center text-red-500 flex items-center justify-center shadow-sm" style={{ height: '44px', fontSize: 'clamp(11px, 3vw, 13px)' }}>
                <MicOff className="w-4 h-4 inline-block me-1.5 flex-shrink-0" />
                <span className="truncate">{t.ai?.micDenied || 'Microphone permission denied'}</span>
              </div>
            ) : !isRecording ? (
              <div className="bg-emerald-50 rounded-full text-center text-emerald-600 active:bg-emerald-500 active:text-white transition-colors select-none flex items-center justify-center shadow-sm" style={{ height: '44px', fontSize: 'clamp(12px, 3.2vw, 14px)' }}>
                <Mic className="w-4 h-4 inline-block me-1.5 flex-shrink-0" />
                <span className="truncate">{t.ai?.holdToSpeak || 'Hold to speak'}</span>
              </div>
            ) : (
              <div className={`${isCancelPending ? 'bg-red-500' : 'bg-emerald-500'} rounded-full px-3 flex items-center gap-2 transition-colors duration-150`} style={{ height: '44px' }}>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <div className="flex items-end gap-[2px] h-4">
                    {waveBarStyles.map((style, i) => (
                      <div key={i} className="w-[3px] bg-white/70 rounded-full" style={isCancelPending ? { height: style.height } : style} />
                    ))}
                  </div>
                  <span className="text-sm text-white font-medium tabular-nums">{recordingTime}"</span>
                  <span className="text-[10px] text-white/60 tabular-nums">/ 60s</span>
                </div>
                <span className="text-[10px] text-white/80 flex-shrink-0">{t.ai?.releaseToSend || 'Release to send'}</span>
              </div>
            )}
          </div>
        )}

        {/* 文字模式 */}
        {inputMode === 'text' && (
          <div className="flex-1 min-w-0 relative" style={{ minHeight: '44px' }}>
            <textarea
              value={textMessage}
              onChange={(e) => {
                setTextMessage(e.target.value);
                const el = e.target;
                el.style.height = '44px';
                if (e.target.value && el.scrollHeight > 44) {
                  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSendText();
                }
              }}
              placeholder={t.community?.typeMessage || 'Type a message...'}
              className={`w-full bg-emerald-50 rounded-full text-emerald-900 placeholder-emerald-400 outline-none focus:ring-2 focus:ring-emerald-300 transition-[box-shadow] resize-none overflow-y-auto shadow-sm ${isRTL ? 'pr-11 pl-4' : 'pl-4 pr-11'}`}
              ref={textInputRef}
              onFocus={handleInputFocus}
              style={{ display: 'block', height: '44px', minHeight: '44px', maxHeight: '120px', lineHeight: '20px', paddingTop: '12px', paddingBottom: '12px', boxSizing: 'border-box', fieldSizing: 'fixed', fontSize: 'clamp(13px, 3.5vw, 15px)' } as React.CSSProperties}
            />
            {textMessage.trim() && (
              <button
                onClick={handleSendText}
                disabled={isSending}
                className={`absolute bottom-1.5 w-8 h-8 flex items-center justify-center active:scale-90 transition-all disabled:opacity-40 disabled:active:scale-100 ${isRTL ? 'left-1.5' : 'right-1.5'}`}
              >
                <Send className="w-5 h-5 text-emerald-600" strokeWidth={2.5} />
              </button>
            )}
          </div>
        )}

        {/* 相机按钮 */}
        <button
          className="w-11 h-11 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-full active:scale-90 transition-all flex-shrink-0"
          onClick={() => cameraCaptureRef.current?.click()}
        >
          <Camera className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );
});