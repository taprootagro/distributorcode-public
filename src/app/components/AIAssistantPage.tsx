import { compressImageFile, COMPRESS_PRESETS } from '../utils/imageCompressor';
import { SecondaryView } from "./SecondaryView";
import { useLanguage } from "../hooks/useLanguage";
import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, Loader, X, ScanLine, RefreshCw, AlertTriangle, FolderOpen, Play, Pause, Sparkles, Copy, Check, ChevronDown, ChevronUp, Send, Mic, PenLine, Image as ImageIcon, Volume2, VolumeX, MicOff } from "lucide-react";
import { TaprootAgroDetector, Detection } from "../utils/taprootAgroDetector";
import { useConfigContext } from "../hooks/ConfigProvider";
import { cloudAIService, type DeepAnalysisResult } from "../services/CloudAIService";
import { cloudAIGuard } from "../utils/cloudAIGuard";
import { useKeyboardHeight } from "../hooks/useKeyboardHeight";
import { isNative } from "../utils/capacitor-bridge";

interface AIAssistantPageProps {
  onClose: () => void;
}

type Status = 'idle' | 'loading' | 'ready' | 'no-model' | 'error' | 'cloud-only';

// Fix 5: 预生成波形条高度，避免在 render 中调用 Math.random()
const AI_WAVE_HEIGHTS = [1.5, 3, 2, 3.5, 1.5, 3, 2].map(h => h * 4);

export function AIAssistantPage({ onClose }: AIAssistantPageProps) {
  const { t, isRTL } = useLanguage();
  const { config } = useConfigContext();
  const a = t.ai;
  const { isKeyboardOpen } = useKeyboardHeight();

  // Cloud-only mode: when cloud AI is enabled AND device is online, skip local model
  // Default / offline → local inference; cloud AI enabled + online → cloud-only
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const cloudOnlyMode = config.cloudAIConfig?.enabled === true && isOnline;

  // 系统相机 input ref
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [detecting, setDetecting] = useState(false);
  const [results, setResults] = useState<Detection[]>([]);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Deep Analysis state
  const [deepAnalysisResult, setDeepAnalysisResult] = useState<DeepAnalysisResult | null>(null);
  const [deepAnalyzing, setDeepAnalyzing] = useState(false);
  const [deepError, setDeepError] = useState('');
  const [deepExpanded, setDeepExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isLocalAIResult, setIsLocalAIResult] = useState(false); // Track if current result is from local AI

  // Anti-abuse guard state
  const [cooldownSec, setCooldownSec] = useState(0);
  const [dailyUsage, setDailyUsage] = useState({ used: 0, limit: 20 });
  const [cachedHit, setCachedHit] = useState(false);
  const [cooldownHint, setCooldownHint] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isUnlimited = dailyUsage.limit >= 999;

  // Follow-up chat state
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai'; text: string; image?: string; voiceDuration?: number; audioUrl?: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatReplying, setChatReplying] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // Voice message playback state (for waveform animation)
  const [playingVoiceIdx, setPlayingVoiceIdx] = useState<number | null>(null);
  const voicePlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopCurrentVoice = useCallback(() => {
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause();
      voiceAudioRef.current.currentTime = 0;
      voiceAudioRef.current = null;
    }
    if (voicePlayTimerRef.current) {
      clearTimeout(voicePlayTimerRef.current);
      voicePlayTimerRef.current = null;
    }
  }, []);

  const toggleVoicePlay = useCallback((idx: number, duration: number) => {
    if (playingVoiceIdx === idx) {
      stopCurrentVoice();
      setPlayingVoiceIdx(null);
    } else {
      stopCurrentVoice();
      setPlayingVoiceIdx(idx);

      // Try real audio playback if audioUrl exists
      const msg = chatMessages[idx];
      const audioUrl = msg?.audioUrl;

      if (audioUrl) {
        try {
          const audio = new Audio(audioUrl);
          voiceAudioRef.current = audio;

          audio.onended = () => {
            setPlayingVoiceIdx(null);
            voiceAudioRef.current = null;
            if (voicePlayTimerRef.current) { clearTimeout(voicePlayTimerRef.current); voicePlayTimerRef.current = null; }
          };

          audio.onerror = () => {
            console.warn('[AI Voice] Audio playback error');
            setPlayingVoiceIdx(null);
            voiceAudioRef.current = null;
          };

          audio.play().catch(() => {
            setPlayingVoiceIdx(null);
            voiceAudioRef.current = null;
          });

          // Safety timeout
          voicePlayTimerRef.current = setTimeout(() => {
            if (voiceAudioRef.current) { voiceAudioRef.current.pause(); voiceAudioRef.current = null; }
            setPlayingVoiceIdx(null);
          }, (duration + 2) * 1000);
        } catch {
          // Fallback to visual-only
          voicePlayTimerRef.current = setTimeout(() => setPlayingVoiceIdx(null), duration * 1000);
        }
      } else {
        // No audio URL — visual animation only
        voicePlayTimerRef.current = setTimeout(() => setPlayingVoiceIdx(null), duration * 1000);
      }
    }
  }, [playingVoiceIdx, chatMessages, stopCurrentVoice]);

  // Input mode: default voice, user can switch to text via pen icon
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');

  // Voice recording state
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceTime, setVoiceTime] = useState(0);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Refs mirror state for touch handlers (avoid stale closures)
  const isVoiceRecordingRef = useRef(false);
  const voiceTimeRef = useRef(0);

  // MediaRecorder for real audio capture
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceCancelledRef = useRef(false);
  const lastVoiceDurationRef = useRef(0); // 录音结束前快照时长，供 onstop 异步回调读取

  // Voice cancel-pending state (finger dragged outside button)
  const [voiceCancelPending, setVoiceCancelPendingState] = useState(false);
  const voiceCancelPendingRef = useRef(false);
  const setVoiceCancelPending = useCallback((pending: boolean) => {
    voiceCancelPendingRef.current = pending;
    setVoiceCancelPendingState(pending);
  }, []);

  // Mic permission denied state (Fix 3)
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);

  // ★ 彻底释放麦克风 — 录音结束/取消/权限拒绝时必须调用
  const releaseMediaStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch { /* already stopped */ }
      }
      mediaRecorderRef.current = null;
    }
  }, []);

  // 组件卸载时确保释放麦克风
  useEffect(() => {
    return () => { releaseMediaStream(); };
  }, [releaseMediaStream]);

  // 语音录制是否可用（Fix 4: 只有 deepAnalysisResult 存在且 AI 没在回复时才可录音）
  const voiceEnabled = !!deepAnalysisResult && !chatReplying && !deepAnalyzing;

  // TTS auto-read state (default ON)
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const ttsUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Strip markdown for cleaner TTS reading
  const stripMarkdown = useCallback((md: string): string => {
    return md
      .replace(/#{1,6}\s*/g, '')           // headings
      .replace(/\*\*([^*]+)\*\*/g, '$1')   // bold
      .replace(/\*([^*]+)\*/g, '$1')       // italic
      .replace(/`([^`]+)`/g, '$1')         // inline code
      .replace(/```[\s\S]*?```/g, '')      // code blocks
      .replace(/>\s?/g, '')                // blockquotes
      .replace(/[-*+]\s/g, '')             // list bullets
      .replace(/\d+\.\s/g, '')             // numbered lists
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
      .replace(/\n{2,}/g, '. ')            // paragraph breaks → pause
      .replace(/\n/g, ' ')
      .trim();
  }, []);

  // Speak text via Capacitor TTS plugin (native) with Web Speech API fallback.
  // Android WebView's speechSynthesis is unreliable — often silently fails.
  // Priority: Capacitor @capacitor-community/text-to-speech → Web speechSynthesis
  const speakText = useCallback((text: string, force = false) => {
    if (!ttsEnabled && !force) return;
    const clean = stripMarkdown(text);
    if (!clean) return;

    // Stop any ongoing speech first
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    // Try Capacitor TTS plugin first (native TTS engine, much more reliable)
    if (isNative()) {
      try {
        const registry = (window as any).__CAP_PLUGINS__;
        const capTTS = registry?.['@capacitor-community/text-to-speech']?.TextToSpeech;
        if (capTTS?.speak) {
          capTTS.speak({ text: clean, rate: 0.9, lang: '' }).catch(() => {
            // Plugin failed — fallback to Web speechSynthesis
            if (window.speechSynthesis) {
              const utterance = new SpeechSynthesisUtterance(clean);
              utterance.rate = 0.95;
              utterance.pitch = 1;
              ttsUtteranceRef.current = utterance;
              window.speechSynthesis.speak(utterance);
            }
          });
          return;
        }
      } catch {
        // Plugin not available — fall through
      }
    }

    // Web fallback
    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    ttsUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [ttsEnabled, stripMarkdown]);

  // Stop TTS when muted or component unmounts
  const stopTTS = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    // Also stop Capacitor TTS plugin
    if (isNative()) {
      try {
        const registry = (window as any).__CAP_PLUGINS__;
        const capTTS = registry?.['@capacitor-community/text-to-speech']?.TextToSpeech;
        if (capTTS?.stop) capTTS.stop().catch(() => {});
      } catch {}
    }
    ttsUtteranceRef.current = null;
  }, []);

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => { stopTTS(); };
  }, [stopTTS]);

  // When user mutes, immediately stop current speech
  const toggleTTS = useCallback(() => {
    setTtsEnabled(prev => {
      if (prev) stopTTS(); // turning off → stop immediately
      return !prev;
    });
  }, [stopTTS]);

  // Handle clicking AI message text to read aloud
  const handleAITextClick = useCallback((text: string) => {
    // Stop any current speech first
    stopTTS();
    // If TTS is off, turn it on automatically
    if (!ttsEnabled) {
      setTtsEnabled(true);
    }
    // Force speak the selected text immediately (bypass ttsEnabled check)
    speakText(text, true);
  }, [ttsEnabled, speakText, stopTTS]);

  // Camera menu state (for chat bar)
  const [showCamMenu, setShowCamMenu] = useState(false);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const chatCameraRef = useRef<HTMLInputElement>(null);

  // Refresh guard state
  const refreshGuardState = useCallback(() => {
    setDailyUsage(cloudAIGuard.getDailyUsage());
    const cd = cloudAIGuard.getCooldownRemaining();
    setCooldownSec(cd);
    if (cd > 0 && !cooldownRef.current) {
      cooldownRef.current = setInterval(() => {
        const remaining = cloudAIGuard.getCooldownRemaining();
        setCooldownSec(remaining);
        setDailyUsage(cloudAIGuard.getDailyUsage());
        if (remaining <= 0 && cooldownRef.current) {
          clearInterval(cooldownRef.current);
          cooldownRef.current = null;
        }
      }, 1000);
    }
  }, []);

  // Init guard state + cleanup
  useEffect(() => {
    refreshGuardState();
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // Listen for online/offline changes
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Helper: format guard translation strings
  const guardText = useCallback((template: string, vars: Record<string, string | number>) => {
    let result = template;
    for (const [k, v] of Object.entries(vars)) {
      result = result.replace(`{${k}}`, String(v));
    }
    return result;
  }, []);

  const fileRef = useRef<HTMLInputElement>(null);
  const detectorRef = useRef<TaprootAgroDetector | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pendingDrawRef = useRef<{ img: HTMLImageElement; dets: Detection[] } | null>(null);

  // 加载模型
  // Silent background loading (for cloud-only mode)
  const silentLoadModel = useCallback(async () => {
    // Skip if already loaded
    if (detectorRef.current) {
      console.log('✅ [Cloud Mode] Model already loaded, skipping background load');
      return;
    }
    
    try {
      const aiCfg = config.aiModelConfig;
      if (!aiCfg?.modelUrl) {
        console.log('⚠️ [Cloud Mode] No model URL configured, skipping background load');
        return;
      }
      
      console.log('🔍 [Cloud Mode] Background loading local model for emergency fallback...');
      const detector = new TaprootAgroDetector({
        modelUrl: aiCfg.modelUrl,
        labelsUrl: aiCfg.labelsUrl || '',
      });
      await detector.loadModel();
      detectorRef.current = detector;
      console.log('✅ [Cloud Mode] Local model loaded in background');
    } catch (err: any) {
      console.log('⚠️ [Cloud Mode] Background model load failed (will try again on network error):', err?.message);
      // Silently fail - we'll try again if network actually fails
    }
  }, [config.aiModelConfig]);

  // Normal loading with UI feedback (for local mode)
  const loadModel = useCallback(async () => {
    setStatus('loading');
    setProgress(0);
    setErrorMsg('');

    try {
      const aiCfg = config.aiModelConfig;
      const detector = new TaprootAgroDetector({
        modelUrl: aiCfg?.modelUrl || '',
        labelsUrl: aiCfg?.labelsUrl || '',
      });
      detector.setProgressCallback((p) => setProgress(p));
      await detector.loadModel();
      detectorRef.current = detector;
      setStatus('ready');
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.log('🔍 Model load error:', msg);
      // 如果云AI已启用，即使本地模型缺失也直接进入云端��式
      if (config.cloudAIConfig?.enabled) {
        setStatus('cloud-only');
      } else {
        setStatus('no-model');
      }
    }
  }, [config.aiModelConfig, config.cloudAIConfig?.enabled]);

  // Initialize: load model based on mode (only runs once on mount)
  useEffect(() => {
    if (cloudOnlyMode) {
      setStatus('cloud-only');
      // Background load local model for emergency fallback
      silentLoadModel();
    } else {
      loadModel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Cloud-only mode: auto-trigger analysis as soon as image is set
  const autoTriggeredRef = useRef(false);
  useEffect(() => {
    if (cloudOnlyMode && image && !autoTriggeredRef.current && !deepAnalyzing && !deepAnalysisResult && !deepError) {
      autoTriggeredRef.current = true;
      handleDeepAnalysis(true);
    }
    if (!image) {
      autoTriggeredRef.current = false;
    }
  }, [image, cloudOnlyMode]);

  // 系统相机拍照回调 — 复用 onFile 逻辑
  const onCameraFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const compressed = await compressImageFile(f, COMPRESS_PRESETS.ai);
      setImage(compressed);
      setResults([]);
      setDone(false);
    } catch {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImage(ev.target?.result as string);
        setResults([]);
        setDone(false);
      };
      reader.readAsDataURL(f);
    }
    // 重置 input，允许连续拍同一张
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  // 选图 — 压缩后再 setState，AI 预设保留足够清晰度识别病虫害
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const compressed = await compressImageFile(f, COMPRESS_PRESETS.ai);
      setImage(compressed);
      setResults([]);
      setDone(false);
    } catch {
      // 压缩失败降级读原图
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImage(ev.target?.result as string);
        setResults([]);
        setDone(false);
      };
      reader.readAsDataURL(f);
    }
  };

  // ===== 对话中系统相机拍照 → 追加图片给AI =====
  const onChatCameraFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setShowCamMenu(false);
    let imgSrc: string;
    try {
      imgSrc = await compressImageFile(f, COMPRESS_PRESETS.ai);
    } catch {
      imgSrc = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.readAsDataURL(f);
      });
    }
    if (chatCameraRef.current) chatCameraRef.current.value = '';
    // 作为用户消息发送图片
    setChatMessages(prev => [...prev, { role: 'user', text: '', image: imgSrc }]);
    // 自动发给AI进行追问
    setChatReplying(true);
    try {
      const context = deepAnalysisResult?.analysis +
        chatMessages.map(m => `\n\n[${m.role === 'user' ? 'User' : 'AI'}]: ${m.image ? '[Photo]' : m.text}`).join('') +
        '\n\n[User]: [Photo attached - please analyze this additional image]';
      const reply = await cloudAIService.followUp('[User sent a follow-up photo for further analysis]', context || '');
      setChatMessages(prev => [...prev, { role: 'ai', text: reply }]);
      refreshGuardState();
    } catch (err: any) {
      const msg = err?.message || '';
      const isNetworkError = msg.includes('network') || msg.includes('fetch') || msg.includes('Failed to fetch') || 
                             msg.includes('NetworkError') || msg.includes('offline') || err?.name === 'TypeError';
      const cloudAIEnabled = config.cloudAIConfig?.enabled === true;
      const errorMsg = (isNetworkError && cloudAIEnabled) ? a.networkErrorHint : (msg || a.deepAnalysisError);
      setChatMessages(prev => [...prev, { role: 'ai', text: `⚠️ ${errorMsg}` }]);
      refreshGuardState();
    } finally {
      setChatReplying(false);
    }
  };

  const onChatFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setShowCamMenu(false);
    let imgSrc = '';
    try {
      imgSrc = await compressImageFile(f, COMPRESS_PRESETS.ai);
    } catch {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        if (src) sendChatImage(src);
      };
      reader.readAsDataURL(f);
      return;
    }
    sendChatImage(imgSrc);
  };

  const sendChatImage = async (imgSrc: string) => {
    setChatMessages(prev => [...prev, { role: 'user', text: '', image: imgSrc }]);
    setChatReplying(true);
    try {
      const context = deepAnalysisResult?.analysis +
        chatMessages.map(m => `\n\n[${m.role === 'user' ? 'User' : 'AI'}]: ${m.image ? '[Photo]' : m.text}`).join('') +
        '\n\n[User]: [Photo attached - please analyze this additional image]';
      const reply = await cloudAIService.followUp('[User sent a follow-up photo for further analysis]', context || '');
      setChatMessages(prev => [...prev, { role: 'ai', text: reply }]);
      refreshGuardState();
    } catch (err: any) {
      const msg = err?.message || '';
      const isNetworkError = msg.includes('network') || msg.includes('fetch') || msg.includes('Failed to fetch') || 
                             msg.includes('NetworkError') || msg.includes('offline') || err?.name === 'TypeError';
      const cloudAIEnabled = config.cloudAIConfig?.enabled === true;
      const errorMsg = (isNetworkError && cloudAIEnabled) ? a.networkErrorHint : (msg || a.deepAnalysisError);
      setChatMessages(prev => [...prev, { role: 'ai', text: `⚠️ ${errorMsg}` }]);
      refreshGuardState();
    } finally {
      setChatReplying(false);
    }
  };

  // Generate local AI analysis from detection results (only when cloud AI enabled but network failed)
  const generateLocalAnalysis = (dets: Detection[], isNetworkFallback = false) => {
    if (dets.length === 0) return;
    
    let analysis = '';
    
    if (isNetworkFallback) {
      analysis += `⚠️ **${a.networkErrorHint}**\n\n`;
      analysis += `📱 **本地AI初步诊断结果**（不支持对话功能）\n\n`;
      analysis += `---\n\n`;
    }
    
    analysis += `## ${a.detected} ${dets.length} ${a.targets}\n\n`;
    
    dets.forEach((det, idx) => {
      const confidence = (det.score * 100).toFixed(1);
      analysis += `### ${idx + 1}. ${det.className}\n\n`;
      analysis += `**Confidence**: ${confidence}%\n\n`;
      analysis += `**Detection**: ${det.className}\n\n`;
      analysis += `**Recommendations**:\n`;
      analysis += `- Regular crop inspection and early detection\n`;
      analysis += `- Maintain proper field ventilation and humidity control\n`;
      analysis += `- Apply appropriate pesticides as needed\n`;
      analysis += `- Remove diseased plant materials to prevent spread\n\n`;
    });
    
    analysis += `---\n\n`;
    
    if (isNetworkFallback) {
      analysis += `💡 **${a.localAINoVoice}**\n\n`;
      analysis += `📶 **网络问题**：信号较差，已使用本地AI进行初步诊断。\n\n`;
      analysis += `🔄 **建议**：请保存照片，等信号良好时重新拍照检测，使用云端AI获取详细分析和对话功能。\n\n`;
      analysis += `---\n\n`;
    } else {
      analysis += `💡 **${a.localAINoVoice}**\n\n`;
      analysis += `---\n\n`;
    }
    
    analysis += `${a.disclaimer}`;
    
    // Set as deep analysis result
    setDeepAnalysisResult({
      analysis,
      cached: false,
      timestamp: Date.now()
    });
    setDeepExpanded(true);
    setIsLocalAIResult(true); // Mark as local AI result
    
    // Auto-read analysis (both local-only mode and network fallback mode)
    speakText(analysis);
  };

  // 真实识别
  const handleDetect = async () => {
    if (!image || !detectorRef.current) return;
    setDetecting(true);
    setResults([]);
    setDone(false);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = image;
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; });

      const dets = await detectorRef.current.detect(img);
      setResults(dets);
      setDone(true);
      pendingDrawRef.current = { img, dets };
      
      // Auto-generate analysis in local-only mode (cloud AI not enabled)
      if (!config.cloudAIConfig?.enabled && dets.length > 0) {
        generateLocalAnalysis(dets, false);
      }
    } catch (err) {
      console.error(err);
      setDone(true);
    } finally {
      setDetecting(false);
    }
  };

  // 画检测框
  const drawBoxes = (img: HTMLImageElement, dets: Detection[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    const colors = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899'];

    dets.forEach((det, i) => {
      const [x1, y1, x2, y2] = det.bbox;
      const bx = x1 * w, by = y1 * h, bw = (x2 - x1) * w, bh = (y2 - y1) * h;
      const color = colors[i % colors.length];

      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.004);
      ctx.setLineDash([]);
      ctx.strokeRect(bx, by, bw, bh);

      ctx.fillStyle = color + '15';
      ctx.fillRect(bx, by, bw, bh);

      const label = `${det.className} ${(det.score * 100).toFixed(0)}%`;
      const fontSize = Math.max(14, Math.min(w, h) * 0.025);
      ctx.font = `bold ${fontSize}px sans-serif`;
      const textW = ctx.measureText(label).width;
      const pad = fontSize * 0.35;
      const labelH = fontSize + pad * 2;

      const labelY = by - labelH > 0 ? by - labelH : by;

      ctx.fillStyle = color;
      ctx.beginPath();
      const r = 4;
      ctx.roundRect(bx, labelY, textW + pad * 2, labelH, [r, r, r, r]);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.fillText(label, bx + pad, labelY + fontSize + pad * 0.3);
    });
  };

  const reset = () => {
    setImage(null);
    setResults([]);
    setDone(false);
    setDeepAnalysisResult(null);
    setDeepAnalyzing(false);
    setDeepError('');
    setCopied(false);
    setIsLocalAIResult(false);
    setChatMessages([]);
    setChatInput('');
    setChatReplying(false);
    setPlayingVoiceIdx(null);
    stopCurrentVoice();
    // 重置录音 refs
    isVoiceRecordingRef.current = false;
    voiceTimeRef.current = 0;
    if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null; }
    if (fileRef.current) fileRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  useEffect(() => {
    if (done && results.length > 0 && pendingDrawRef.current) {
      const pending = pendingDrawRef.current;
      const raf = requestAnimationFrame(() => {
        if (canvasRef.current) {
          drawBoxes(pending.img, pending.dets);
          pendingDrawRef.current = null;
        }
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [done, results]);

  // Deep Analysis handler (unified for both local+cloud and cloud-only modes)
  const handleDeepAnalysis = async (forceCloudOnly = false) => {
    if (!image) return;
    // In cloud-only mode or forced cloud-only, we don't require local detection results
    const isCloudOnly = cloudOnlyMode || forceCloudOnly;
    if (!isCloudOnly && results.length === 0) return;
    setDeepAnalyzing(true);
    setDeepError('');
    setDeepAnalysisResult(null);
    setDeepExpanded(true);
    setCachedHit(false);

    try {
      const detections = isCloudOnly ? [] : results.map((d) => ({ className: d.className, score: d.score }));
      const result = await cloudAIService.analyze(image, detections);
      setDeepAnalysisResult(result);
      setIsLocalAIResult(false); // Mark as cloud AI result
      if (isCloudOnly) setDone(true);
      refreshGuardState();
      // Auto-read the initial analysis
      speakText(result.analysis);
    } catch (err: any) {
      const msg = err?.message || '';
      // Check if it's a network error and cloud AI is enabled
      const isNetworkError = msg.includes('network') || msg.includes('fetch') || msg.includes('Failed to fetch') || 
                             msg.includes('NetworkError') || msg.includes('offline') || err?.name === 'TypeError';
      const cloudAIEnabled = config.cloudAIConfig?.enabled === true;
      
      if (isNetworkError && cloudAIEnabled && !isCloudOnly && results.length > 0) {
        // Scenario 3a: Network error with cloud AI enabled + local results already available
        // Fallback to local AI with network warning
        generateLocalAnalysis(results, true);
      } else if (isNetworkError && cloudAIEnabled && isCloudOnly) {
        // Scenario 3b: Cloud-only mode network error - fallback to local detection
        // (Model should already be loaded in background, but load if needed)
        try {
          // Ensure local model is loaded (should already be loaded from background)
          if (!detectorRef.current) {
            console.log('⚠️ Background model not ready, loading now...');
            const aiCfg = config.aiModelConfig;
            const detector = new TaprootAgroDetector({
              modelUrl: aiCfg?.modelUrl || '',
              labelsUrl: aiCfg?.labelsUrl || '',
            });
            await detector.loadModel();
            detectorRef.current = detector;
          } else {
            console.log('✅ Using background-loaded model for fallback');
          }
          
          // Run local detection
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = image;
          await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; });
          const dets = await detectorRef.current.detect(img);
          setResults(dets);
          setDone(true);
          pendingDrawRef.current = { img, dets };
          if (dets.length > 0) {
            generateLocalAnalysis(dets, true);
          } else {
            setDeepError(a.networkErrorHint);
          }
        } catch (localErr) {
          // Local detection also failed
          setDeepError(a.networkErrorHint);
        }
      } else if (isNetworkError && cloudAIEnabled) {
        // Network error but no local model available
        setDeepError(a.networkErrorHint);
      } else {
        setDeepError(msg || a.deepAnalysisError);
      }
      refreshGuardState();
    } finally {
      setDeepAnalyzing(false);
    }
  };

  // Cloud-only shorthand
  const handleCloudAnalysis = () => handleDeepAnalysis(true);

  // Copy report to clipboard
  const handleCopyReport = async () => {
    if (!deepAnalysisResult) return;
    try {
      await navigator.clipboard.writeText(deepAnalysisResult.analysis);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = deepAnalysisResult.analysis;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Follow-up chat handler (text)
  const handleChatSend = async () => {
    const msg = chatInput.trim();
    if (!msg || !deepAnalysisResult || chatReplying || deepAnalyzing) return;

    const userMsg = { role: 'user' as const, text: msg };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    // Reset textarea height
    if (chatInputRef.current) {
      chatInputRef.current.style.height = '48px';
    }
    
    // Check if this is local AI result (pure local or network fallback)
    if (isLocalAIResult) {
      // Local AI - provide simple response
      setChatMessages(prev => [...prev, { role: 'ai', text: a.localAINoVoice }]);
      return;
    }
    
    setChatReplying(true);

    try {
      const fullContext = deepAnalysisResult.analysis +
        chatMessages.map(m => `\n\n[${m.role === 'user' ? 'User' : 'AI'}]: ${m.text}`).join('') +
        `\n\n[User]: ${msg}`;
      const reply = await cloudAIService.followUp(msg, fullContext);
      setChatMessages(prev => [...prev, { role: 'ai', text: reply }]);
      refreshGuardState();
    } catch (err: any) {
      const msg = err?.message || '';
      const isNetworkError = msg.includes('network') || msg.includes('fetch') || msg.includes('Failed to fetch') || 
                             msg.includes('NetworkError') || msg.includes('offline') || err?.name === 'TypeError';
      const cloudAIEnabled = config.cloudAIConfig?.enabled === true;
      const errorMsg = (isNetworkError && cloudAIEnabled) ? a.networkErrorHint : (msg || a.deepAnalysisError);
      setChatMessages(prev => [...prev, { role: 'ai', text: `⚠️ ${errorMsg}` }]);
      refreshGuardState();
    } finally {
      setChatReplying(false);
    }
  };

  // Start real MediaRecorder
  const startRealRecording = async () => {
    setMicPermissionDenied(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // ★ 权限弹窗期间 touchEnd 可能已调用 handleVoiceRecordEnd 取消录音
      // isVoiceRecordingRef 已被重置为 false → 放弃录音，立即释放麦克风
      if (!isVoiceRecordingRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      voiceCancelledRef.current = false;

      // Prefer webm/opus, fallback to any supported
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        // ★ 立即释放麦克风 — 不在后台保持
        stream.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;

        if (voiceCancelledRef.current) {
          audioChunksRef.current = [];
          return;
        }

        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        audioChunksRef.current = [];
        if (blob.size > 0) {
          handleVoiceSendReal(blob);
        }
      };

      recorder.start(250); // collect chunks every 250ms
    } catch (err) {
      console.error('[Voice] Microphone access denied:', err);
      // Fix 3: 显示权限拒绝提示
      setMicPermissionDenied(true);
      setTimeout(() => setMicPermissionDenied(false), 3000);
      // 彻底释放
      releaseMediaStream();
      // 重置所有录音状态（state + refs 同步）
      isVoiceRecordingRef.current = false;
      voiceTimeRef.current = 0;
      setIsVoiceRecording(false);
      if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null; }
      setVoiceTime(0);
    }
  };

  // Stop real MediaRecorder — onstop 回调会释放 stream tracks
  const stopRealRecording = (cancel = false) => {
    voiceCancelledRef.current = cancel;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop(); // 触发 onstop → 释放 stream
    } else {
      // MediaRecorder 已经停了，手动释放 stream
      releaseMediaStream();
    }
  };

  // Convert blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Follow-up handler (voice) — sends real audio blob to cloud AI
  // Fix 1: 移除静默丢弃，voiceEnabled 守卫已在 UI 层阻止不可用时录音
  const handleVoiceSendReal = async (audioBlob: Blob) => {
    const durationSec = lastVoiceDurationRef.current || 1;

    // 如果 AI 分析结果尚未就绪（理论上不应到达这里，因为 UI 已禁用）
    if (!deepAnalysisResult) {
      console.warn('[Voice] deepAnalysisResult is null — voice message dropped (should not happen)');
      return;
    }

    // Create a playable objectURL so the user can replay their own voice message
    const audioUrl = URL.createObjectURL(audioBlob);
    setChatMessages(prev => [...prev, { role: 'user', text: '', voiceDuration: durationSec, audioUrl }]);
    
    // Check if this is local AI result (pure local or network fallback)
    if (isLocalAIResult) {
      setChatMessages(prev => [...prev, { role: 'ai', text: `⚠️ ${a.localAINoVoice}` }]);
      return;
    }
    
    setChatReplying(true);

    try {
      const audioBase64 = await blobToBase64(audioBlob);
      const fullContext = deepAnalysisResult.analysis +
        chatMessages.map(m => `\n\n[${m.role === 'user' ? 'User' : 'AI'}]: ${m.text}`).join('');

      const reply = await cloudAIService.voiceFollowUp(audioBase64, fullContext);
      setChatMessages(prev => [...prev, { role: 'ai', text: reply }]);
      refreshGuardState();
    } catch (err: any) {
      const msg = err?.message || '';
      const isNetworkError = msg.includes('network') || msg.includes('fetch') || msg.includes('Failed to fetch') || 
                             msg.includes('NetworkError') || msg.includes('offline') || err?.name === 'TypeError';
      const cloudAIEnabled = config.cloudAIConfig?.enabled === true;
      const errorMsg = (isNetworkError && cloudAIEnabled) ? a.networkErrorHint : (msg || a.deepAnalysisError);
      setChatMessages(prev => [...prev, { role: 'ai', text: `⚠️ ${errorMsg}` }]);
      refreshGuardState();
    } finally {
      setChatReplying(false);
    }
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatReplying]);

  // 键盘弹出时也滚动到底部，确保输入框可见
  useEffect(() => {
    if (isKeyboardOpen && chatEndRef.current) {
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [isKeyboardOpen]);

  // Auto-read latest AI reply via TTS
  const lastSpokenIndexRef = useRef(-1);
  useEffect(() => {
    if (!ttsEnabled || chatMessages.length === 0) return;
    const lastIdx = chatMessages.length - 1;
    const lastMsg = chatMessages[lastIdx];
    if (lastMsg.role === 'ai' && lastIdx > lastSpokenIndexRef.current && !lastMsg.text.startsWith('⚠️')) {
      lastSpokenIndexRef.current = lastIdx;
      speakText(lastMsg.text);
    }
  }, [chatMessages, ttsEnabled, speakText]);

  // Show cooldown hint temporarily
  const showCooldownHint = useCallback(() => {
    setCooldownHint(true);
    setTimeout(() => setCooldownHint(false), 2000);
  }, []);

  // Check if action should be blocked — limits removed, always allow
  const isBlocked = useCallback(() => {
    return false;
  }, []);

  // ── 语音录制辅助函数（Touch + Mouse 共用）──
  const handleVoiceRecordStart = useCallback(() => {
    if (isVoiceRecordingRef.current) return;
    // Fix 4: 语音不可用时阻止录音（UI 层也会禁用，这里是二重保险）
    if (!deepAnalysisResult || chatReplying || deepAnalyzing) return;
    stopTTS();
    isVoiceRecordingRef.current = true;
    voiceTimeRef.current = 0;
    voiceCancelPendingRef.current = false;
    setIsVoiceRecording(true);
    setVoiceCancelPendingState(false);
    setVoiceTime(0);
    startRealRecording();
    voiceTimerRef.current = setInterval(() => {
      voiceTimeRef.current += 1;
      const t = voiceTimeRef.current;
      setVoiceTime(t);
      if (t >= 59) {
        lastVoiceDurationRef.current = t;
        isVoiceRecordingRef.current = false;
        voiceCancelPendingRef.current = false;
        setIsVoiceRecording(false);
        setVoiceCancelPendingState(false);
        if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null; }
        stopRealRecording(false);
      }
    }, 1000);
  }, [stopTTS, deepAnalysisResult, chatReplying, deepAnalyzing]);

  const handleVoiceRecordEnd = useCallback(() => {
    if (!isVoiceRecordingRef.current) return;
    const duration = voiceTimeRef.current;
    const wasCancelled = voiceCancelPendingRef.current;
    lastVoiceDurationRef.current = duration;
    isVoiceRecordingRef.current = false;
    voiceCancelPendingRef.current = false;
    setIsVoiceRecording(false);
    setVoiceCancelPendingState(false);
    if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null; }
    if (wasCancelled || duration < 1) {
      stopRealRecording(true);
    } else {
      stopRealRecording(false);
    }
    voiceTimeRef.current = 0;
    setVoiceTime(0);
  }, []);

  const handleVoiceRecordCancel = useCallback(() => {
    if (!isVoiceRecordingRef.current) return;
    isVoiceRecordingRef.current = false;
    voiceCancelPendingRef.current = false;
    setIsVoiceRecording(false);
    setVoiceCancelPendingState(false);
    if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null; }
    stopRealRecording(true);
    voiceTimeRef.current = 0;
    setVoiceTime(0);
  }, []);

  // Close camera menu on outside click
  useEffect(() => {
    if (!showCamMenu) return;
    const handleClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.cam-menu-container')) setShowCamMenu(false);
    };
    document.addEventListener('touchstart', handleClick);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('touchstart', handleClick);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [showCamMenu]);

  // Simple markdown renderer for analysis text
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      // Headers
      if (line.startsWith('## ')) return <h2 key={i} className="text-base text-gray-900 mt-4 mb-2">{line.slice(3)}</h2>;
      if (line.startsWith('### ')) return <h3 key={i} className="text-sm text-gray-800 mt-3 mb-1">{line.slice(4)}</h3>;
      if (line.startsWith('#### ')) return <h4 key={i} className="text-xs text-gray-700 mt-2 mb-1">{line.slice(5)}</h4>;
      // Horizontal rule
      if (line.startsWith('---')) return <hr key={i} className="my-3 border-gray-200" />;
      // List items
      if (line.startsWith('- **')) {
        const match = line.match(/^- \*\*(.+?)\*\*[：:](.*)$/);
        if (match) return <p key={i} className="text-xs text-gray-600 ms-3 my-0.5"><span className="text-gray-800">{match[1]}</span>：{match[2]}</p>;
      }
      if (line.startsWith('- ')) return <p key={i} className="text-xs text-gray-600 ms-3 my-0.5">{line.slice(2)}</p>;
      // Numbered items
      if (/^\d+\.\s\*\*/.test(line)) {
        const match = line.match(/^(\d+)\.\s\*\*(.+?)\*\*[：:](.*)$/);
        if (match) return <p key={i} className="text-xs text-gray-600 ms-3 my-0.5"><span className="text-emerald-700">{match[1]}.</span> <span className="text-gray-800">{match[2]}</span>：{match[3]}</p>;
      }
      // Bold text
      if (line.includes('**')) {
        const parts = line.split(/\*\*(.+?)\*\*/g);
        return <p key={i} className="text-xs text-gray-600 my-0.5">{parts.map((part, j) => j % 2 === 1 ? <span key={j} className="text-gray-800">{part}</span> : part)}</p>;
      }
      // Italic/small text
      if (line.startsWith('*') && line.endsWith('*')) return <p key={i} className="text-[10px] text-gray-400 my-0.5 italic">{line.slice(1, -1)}</p>;
      // Empty line
      if (line.trim() === '') return <div key={i} className="h-1" />;
      // Normal text
      return <p key={i} className="text-xs text-gray-600 my-0.5">{line}</p>;
    });
  };

  // ===== 底部操作栏 — 通过 footer 插槽固定在叉号上方 =====
  const bottomBar = image ? (
    <div className="bg-white px-3 pt-3 pb-3 space-y-2 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
      {/* 识别按钮 — 本地模式，未开始 */}
      {!done && !detecting && !cloudOnlyMode && (
        <button
          onClick={handleDetect}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-3.5 rounded-2xl active:scale-[0.97] transition-transform shadow-lg shadow-emerald-200/50"
        >
          <ScanLine className="w-4 h-4" /><span className="font-medium">{a.startDetect}</span>
        </button>
      )}

      {/* 深度分析按钮 — 本地检测完成后（仅在开启云AI时显示） */}
      {done && results.length > 0 && !deepAnalysisResult && !deepAnalyzing && !deepError && config.cloudAIConfig?.enabled && (
        <>
          <button
            onClick={() => handleDeepAnalysis()}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-3.5 rounded-2xl active:scale-[0.97] transition-transform shadow-lg shadow-emerald-200/50"
          >
            <Sparkles className="w-4 h-4" /><span className="font-medium">{a.deepAnalysis}</span>
          </button>
        </>
      )}

      {/* 分析中 — 仅非云端模式显示进度提示 */}
      {!cloudOnlyMode && (detecting || deepAnalyzing) && (
        <div className="flex items-center justify-center gap-2 py-2">
          <Loader className="w-4 h-4 text-emerald-500 animate-spin" />
          <span className="text-xs text-gray-500">{detecting ? a.aiAnalyzing : a.deepAnalyzing}</span>
        </div>
      )}

      {/* ═══ 聊天栏：默认语音模式，点笔切文字 ═══ */}
      {(deepAnalysisResult || (cloudOnlyMode && image)) && (
        <div className="flex items-end gap-2">
          {/* 左侧切换按钮：语音模式显示笔(切文字)，文字模式显示麦克风(切语音) */}
          <button
            onClick={() => setInputMode(inputMode === 'voice' ? 'text' : 'voice')}
            className="w-11 h-11 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-full active:scale-90 transition-all flex-shrink-0"
          >
            {inputMode === 'voice' ? <PenLine className="w-[18px] h-[18px]" /> : <Mic className="w-[18px] h-[18px]" />}
          </button>

          {/* ── 语音模式：按住说话按钮 ── */}
          {inputMode === 'voice' && (
            <div
              className="flex-1 min-w-0 select-none"
              style={{ height: '44px' }}
              onTouchStart={(e) => {
                if (!voiceEnabled || micPermissionDenied) return;
                const touch = e.touches[0];
                const rect = e.currentTarget.getBoundingClientRect();
                (e.currentTarget as any).__startY = touch?.clientY || 0;
                (e.currentTarget as any).__btnRect = rect;
                handleVoiceRecordStart();
              }}
              onTouchMove={(e) => {
                if (!isVoiceRecordingRef.current) return;
                const touch = e.touches[0];
                const rect = (e.currentTarget as any).__btnRect as DOMRect;
                if (!rect || !touch) return;
                const isOutside =
                  touch.clientX < rect.left - 20 ||
                  touch.clientX > rect.right + 20 ||
                  touch.clientY < rect.top - 20 ||
                  touch.clientY > rect.bottom + 20;
                if (isOutside !== voiceCancelPendingRef.current) {
                  setVoiceCancelPending(isOutside);
                }
              }}
              onTouchEnd={() => handleVoiceRecordEnd()}
              onTouchCancel={() => handleVoiceRecordCancel()}
              onMouseDown={() => { if (voiceEnabled && !micPermissionDenied) handleVoiceRecordStart(); }}
              onMouseUp={() => handleVoiceRecordEnd()}
              onMouseLeave={() => {
                if (isVoiceRecordingRef.current) {
                  setVoiceCancelPending(true);
                  handleVoiceRecordEnd();
                }
              }}
            >
              {/* Fix 3: 麦克风权限被拒绝 */}
              {micPermissionDenied ? (
                <div className="bg-red-50 rounded-full text-center text-red-500 flex items-center justify-center shadow-sm" style={{ height: '44px', fontSize: 'clamp(11px, 3vw, 13px)' }}>
                  <MicOff className="w-4 h-4 inline-block me-1.5 flex-shrink-0" />
                  <span className="truncate">{a.micDenied || 'Microphone permission denied'}</span>
                </div>
              ) : !isVoiceRecording ? (
                /* Fix 4: voiceEnabled=false 时显示禁用态 + 提示 */
                <div className={`rounded-full text-center select-none flex items-center justify-center shadow-sm ${voiceEnabled ? 'bg-emerald-50 text-emerald-600 active:bg-emerald-500 active:text-white' : 'bg-gray-100 text-gray-400'} transition-colors`} style={{ height: '44px', fontSize: 'clamp(12px, 3.2vw, 14px)' }}>
                  <Mic className="w-4 h-4 inline-block me-1.5 flex-shrink-0" />
                  <span className="truncate">{voiceEnabled ? a.holdToSpeak : (deepAnalyzing ? (a.deepAnalyzing || 'Analyzing...') : (chatReplying ? (a.aiReplying || 'AI replying...') : a.holdToSpeak))}</span>
                </div>
              ) : (
                <div className={`${voiceCancelPending ? 'bg-red-500' : 'bg-emerald-500'} rounded-full px-3 flex items-center gap-2 transition-colors duration-150`} style={{ height: '44px' }}>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <div className="flex items-end gap-[2px] h-4">
                      {/* Fix 5: 使用预计算的 AI_WAVE_HEIGHTS 替代 Math.random() */}
                      {AI_WAVE_HEIGHTS.map((h, i) => (
                        <div key={i} className="w-[3px] bg-white/70 rounded-full" style={voiceCancelPending ? {
                          height: `${h}px`,
                        } : {
                          height: `${h}px`,
                          animation: `voiceWave 0.4s ease-in-out ${i * 0.07}s infinite alternate`
                        }} />
                      ))}
                    </div>
                    <span className="text-sm text-white font-medium tabular-nums">{voiceTime}"</span>
                    <span className="text-[10px] text-white/60 tabular-nums">/ 60s</span>
                  </div>
                  <span className="text-[10px] text-white/80 flex-shrink-0">{a.releaseToSend}</span>
                </div>
              )}
            </div>
          )}

          {/* ── 文字模式：输入框 + 内嵌发送按钮 ── */}
          {inputMode === 'text' && (
            <div className="flex-1 min-w-0 relative" style={{ minHeight: '44px' }}>
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => {
                  setChatInput(e.target.value);
                  // Auto-resize: always reset to min height first
                  e.target.style.height = '44px';
                  // If content needs more space, expand (but only if not empty)
                  if (e.target.value && e.target.scrollHeight > 44) {
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                  }
                }}
                onKeyDown={(e) => { 
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleChatSend();
                  }
                }}
                placeholder={a.chatPlaceholder || '输入消息...'}
                disabled={chatReplying || deepAnalyzing || !deepAnalysisResult || (!isUnlimited && dailyUsage.used >= dailyUsage.limit)}
                rows={1}
                className={`w-full bg-emerald-50 rounded-full text-gray-700 placeholder-emerald-400 outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50 transition-all resize-none shadow-sm ${isRTL ? 'pr-11 pl-4' : 'pl-4 pr-11'}`}
                style={{ display: 'block', height: '44px', minHeight: '44px', maxHeight: '120px', paddingTop: '12px', paddingBottom: '12px', lineHeight: '20px', boxSizing: 'border-box', fieldSizing: 'fixed', fontSize: 'clamp(13px, 3.5vw, 15px)' } as React.CSSProperties}
              />
              {/* 发送按钮 — 仅文字模式有内容时显示，在输入框内部 */}
              {chatInput.trim() && (
                <button
                  onClick={handleChatSend}
                  disabled={chatReplying || deepAnalyzing || !deepAnalysisResult || (!isUnlimited && dailyUsage.used >= dailyUsage.limit)}
                  className={`absolute bottom-1.5 w-8 h-8 flex items-center justify-center active:scale-90 transition-all disabled:opacity-40 disabled:active:scale-100 ${isRTL ? 'left-1.5' : 'right-1.5'}`}
                >
                  <Send className="w-5 h-5 text-emerald-600" strokeWidth={2.5} />
                </button>
              )}
            </div>
          )}

          <div className="relative flex-shrink-0 cam-menu-container">
            <button
              onClick={() => setShowCamMenu(!showCamMenu)}
              className="w-11 h-11 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-full active:scale-90 transition-all flex-shrink-0 shadow-sm"
            >
              <Camera className="w-5 h-5" />
            </button>
            {showCamMenu && (
              <div className={`absolute bottom-full mb-2 bg-white rounded-2xl shadow-2xl py-2 z-20 w-40 overflow-hidden ${isRTL ? 'left-0' : 'right-0'}`}>
                <button
                  onClick={() => { setShowCamMenu(false); chatCameraRef.current?.click(); }}
                  className="w-full px-4 py-3 flex items-center gap-3 active:bg-gray-50 transition-colors"
                >
                  <Camera className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm text-gray-700">{a.takePhoto}</span>
                </button>
                <div className="mx-3" style={{ height: '1px', background: 'linear-gradient(to right, transparent, rgba(0,0,0,0.06), transparent)' }} />
                <button
                  onClick={() => { setShowCamMenu(false); chatFileRef.current?.click(); }}
                  className="w-full px-4 py-3 flex items-center gap-3 active:bg-gray-50 transition-colors"
                >
                  <ImageIcon className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm text-gray-700">{a.selectAlbum}</span>
                </button>
              </div>
            )}
            <input ref={chatCameraRef} type="file" accept="image/*" capture="environment" onChange={onChatCameraFile} className="hidden" />
            <input ref={chatFileRef} type="file" accept="image/*" onChange={onChatFile} className="hidden" />
          </div>
        </div>
      )}



      {/* 重新拍照按钮 */}
      {done && !deepAnalysisResult && !deepAnalyzing && !deepError && results.length === 0 && !cloudOnlyMode && (
        <button
          onClick={reset}
          className="w-full flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 py-3.5 rounded-2xl active:scale-[0.97] transition-transform shadow-md shadow-emerald-100/40"
        >
          <Camera className="w-4 h-4" /><span className="font-medium">{a.retakePhoto}</span>
        </button>
      )}
    </div>
  ) : null;

  // ===== 渲 =====
  return (
    <SecondaryView
      onClose={onClose}
      title={t.home.aiAssistant}
      showTitle={true}
      footer={bottomBar}
      headerRight={
        (deepAnalysisResult || (cloudOnlyMode && image)) ? (
          <button
            onClick={toggleTTS}
            className={`flex items-center justify-center w-9 h-9 active:scale-90 transition-all touch-manipulation rounded-xl ${ttsEnabled ? '' : 'bg-emerald-100'}`}
            aria-label={ttsEnabled ? 'Mute' : 'Unmute'}
          >
            {ttsEnabled
              ? <Volume2 className="w-5 h-5 text-emerald-600" strokeWidth={2} />
              : <VolumeX className="w-5 h-5 text-emerald-600" strokeWidth={2} />
            }
          </button>
        ) : undefined
      }
    >
      <div className={`flex flex-col ${!image && status !== 'no-model' ? 'h-full overflow-hidden' : 'min-h-full'} ${deepAnalysisResult ? 'bg-gradient-to-b from-emerald-50 to-white' : ''}`} style={deepAnalysisResult ? {} : { backgroundColor: 'var(--app-bg)' }}>

        {/* 顶部状态 */}
        <div className="px-4 pt-2 pb-1 flex-shrink-0">
          {status === 'loading' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2 mb-1 min-w-0">
                <Loader className="w-3.5 h-3.5 text-emerald-600 animate-spin flex-shrink-0" />
                <span className="text-xs text-emerald-700 font-medium truncate min-w-0">{a.loadingModel}</span>
                <span className="text-[10px] text-emerald-500 ms-auto flex-shrink-0">{progress}%</span>
              </div>
              <div className="w-full bg-emerald-200 rounded-full h-1">
                <div className="bg-emerald-600 h-1 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {status === 'ready' && (
            <div className="flex items-center gap-2 bg-emerald-50 rounded-xl px-3 py-2 min-w-0 shadow-sm">
              <div className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />
              <span className="text-xs text-emerald-700 font-medium truncate min-w-0">{a.modelReady}</span>
              <span className="text-[10px] text-emerald-500 ms-auto flex-shrink-0 whitespace-nowrap">{detectorRef.current?.getLabels().length || 0} {a.classes}</span>
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-2 bg-red-50 rounded-xl px-3 py-2 min-w-0 shadow-sm">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              <span className="text-xs text-red-600 truncate flex-1 min-w-0">{errorMsg || a.loadFailed}</span>
              <button onClick={loadModel} className="text-[10px] text-red-700 font-medium px-2 py-0.5 rounded bg-red-100 active:bg-red-200 flex-shrink-0 whitespace-nowrap">{a.retry}</button>
            </div>
          )}


          {/* 免责声明 — 仅在检测完成后显示 */}
          {done && (
            <div className="flex items-center gap-2 mt-2 px-3 py-2.5 bg-amber-50 rounded-xl shadow-md shadow-amber-100/60">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <p className="text-[11px] text-amber-700 leading-relaxed">{a.disclaimer}</p>
            </div>
          )}
        </div>

        {/* 主区域 — 可滚动 */}
        {status === 'no-model' ? (
          <div className="flex-1 flex items-center justify-center px-5">
            <div className="w-full max-w-sm">
              <div className="text-center mb-5">
                <div className="w-16 h-16 mx-auto mb-3 bg-gray-100 rounded-2xl flex items-center justify-center">
                  <FolderOpen className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-base font-bold text-gray-800 mb-1">{a.noModel}</h3>
                <p className="text-xs text-gray-500">{a.noModelDesc}</p>
              </div>

              <div className="bg-gray-50 rounded-xl p-3.5 mb-4 space-y-2 overflow-hidden">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full text-center leading-5 text-[11px] font-bold flex-shrink-0">1</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-700 break-words">{a.step1}</p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5 break-all">python export_model.py --format onnx --imgsz 640</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full text-center leading-5 text-[11px] font-bold flex-shrink-0">2</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-700 break-words">{a.step2}</p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5 break-all">public/models/taprootagro.onnx</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full text-center leading-5 text-[11px] font-bold flex-shrink-0">3</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-700 break-words">{a.step3}</p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5 break-all">public/models/labels.json</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <button onClick={loadModel} className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl font-medium active:scale-[0.97] transition-transform flex items-center justify-center gap-2 px-4">
                  <RefreshCw className="w-4 h-4 flex-shrink-0" /><span className="truncate">{a.redetectModel}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
          <div className="flex-1 px-4 pb-4 overflow-hidden">
            {!image ? (
              <div className="h-full flex flex-col items-center justify-center">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center">
                    <ScanLine className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-base font-bold text-gray-800 mb-1">{a.photoDetect}</h3>
                  <p className="text-xs text-gray-500">{a.photoDetectDesc}</p>
                </div>

                <div className="w-full max-w-xs space-y-3">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3.5 rounded-2xl active:scale-[0.97] transition-transform shadow-lg shadow-emerald-200/60"
                  >
                    <Camera className="w-5 h-5" /><span className="font-medium">{a.takePhoto}</span>
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 bg-white text-emerald-700 py-3.5 rounded-2xl active:scale-[0.97] transition-transform shadow-lg shadow-gray-200/60"
                  >
                    <ImageIcon className="w-5 h-5" /><span className="font-medium">{t.camera.chooseFromAlbum}</span>
                  </button>
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={onCameraFile} className="hidden" />
                  <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
                </div>
              </div>
            ) : (
              /* 检测结果区域 */
              <div className="mt-3 space-y-3">
                {/* ═══ Cloud-only: 对话式分析界面 ═══ */}
                {cloudOnlyMode ? (
                  <div className="space-y-3">
                    {/* 用户发送的图片 — 普通右侧气泡 */}
                    <div className="flex justify-end">
                      <div className={`max-w-[85%] rounded-2xl px-1.5 py-1.5 bg-emerald-500 ${isRTL ? 'rounded-bl-md' : 'rounded-br-md'}`}>
                        <img src={image} alt="" className="max-w-48 max-h-48 w-auto h-auto rounded-xl block" />
                      </div>
                    </div>

                    {/* AI正在分析 */}
                    {deepAnalyzing && (
                      <div className="flex justify-start">
                        <div className={`bg-gray-100 rounded-2xl ${isRTL ? 'rounded-br-md' : 'rounded-bl-md'} px-4 py-3 max-w-[85%]`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="w-4 h-4 text-emerald-500 animate-pulse" />
                            <span className="text-xs text-gray-600 font-medium">{a.deepAnalyzing}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1 overflow-hidden">
                            <div className="bg-emerald-500 h-1 rounded-full" style={{ width: '60%', animation: 'loading 2s ease-in-out infinite' }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* AI分析出错 */}
                    {deepError && (
                      <div className="flex justify-start">
                        <div className={`bg-red-50 rounded-2xl ${isRTL ? 'rounded-br-md' : 'rounded-bl-md'} px-4 py-3 max-w-[85%]`}>
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                            <span className="text-xs text-red-600 font-medium">{a.deepAnalysisError}</span>
                          </div>
                          <p className="text-[10px] text-red-400 mb-2">{deepError}</p>
                          <button
                            onClick={() => { autoTriggeredRef.current = false; handleCloudAnalysis(); }}
                            className="w-full flex items-center justify-center gap-2 bg-red-100 text-red-700 py-2 rounded-xl active:scale-[0.97] transition-transform text-xs font-medium"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />{a.deepAnalysisRetry}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* AI分��结果 — 与普通AI消息统一风格 */}
                    {deepAnalysisResult && (
                      <div className="flex justify-start">
                        <div 
                          className={`max-w-[85%] rounded-2xl px-3 py-2 bg-gray-100 text-gray-700 ${isRTL ? 'rounded-br-md' : 'rounded-bl-md'} cursor-pointer active:opacity-70`}
                          onClick={() => handleAITextClick(deepAnalysisResult.analysis)}
                        >
                          <div className="leading-relaxed" style={{ fontSize: 'clamp(13px, 3.5vw, 15px)' }}>{renderMarkdown(deepAnalysisResult.analysis)}</div>
                        </div>
                      </div>
                    )}

                    {/* 追问对话消息 */}
                    {chatMessages.map((msg, idx) => {
                      const isVoice = !!msg.voiceDuration;
                      const isPlaying = playingVoiceIdx === idx;
                      return (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div 
                          className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                            msg.role === 'user'
                              ? `bg-emerald-500 text-white ${isRTL ? 'rounded-bl-md' : 'rounded-br-md'}`
                              : `bg-gray-100 text-gray-700 ${isRTL ? 'rounded-br-md' : 'rounded-bl-md'} cursor-pointer active:opacity-70`
                          }`}
                          onClick={() => msg.role === 'ai' && !msg.text.startsWith('⚠️') && handleAITextClick(msg.text)}
                        >
                          {msg.image && (
                            <img src={msg.image} alt="" className="max-w-44 max-h-48 w-auto h-auto rounded-xl mb-1" />
                          )}
                          {isVoice ? (
                            <button
                              className="flex items-center gap-2 min-w-[80px] w-full"
                              onClick={(e) => { e.stopPropagation(); toggleVoicePlay(idx, msg.voiceDuration!); }}
                            >
                              {isPlaying
                                ? <Pause className="w-3.5 h-3.5 flex-shrink-0" />
                                : <Play className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" />
                              }
                              <div className="flex items-end gap-[2px] h-4">
                                {[1.5, 3, 2, 3.5, 1.5, 3, 2].map((h, i) => (
                                  <div
                                    key={i}
                                    className={`w-[3px] rounded-full ${msg.role === 'user' ? 'bg-white/80' : 'bg-gray-500'}`}
                                    style={isPlaying ? {
                                      height: `${h * 4}px`,
                                      animation: `voiceWave 0.4s ease-in-out ${i * 0.07}s infinite alternate`,
                                    } : {
                                      height: `${h * 4}px`,
                                    }}
                                  />
                                ))}
                              </div>
                              <span className="text-[10px] font-semibold flex-shrink-0">{msg.voiceDuration}"</span>
                            </button>
                          ) : msg.role === 'ai' ? (
                            <div className="leading-relaxed" style={{ fontSize: 'clamp(13px, 3.5vw, 15px)' }}>{renderMarkdown(msg.text)}</div>
                          ) : msg.text ? (
                            <p className="leading-relaxed" style={{ fontSize: 'clamp(13px, 3.5vw, 15px)' }}>{msg.text}</p>
                          ) : null}
                        </div>
                      </div>
                      );
                    })}
                    {chatReplying && (
                      <div className="flex justify-start">
                        <div className={`bg-gray-100 rounded-2xl ${isRTL ? 'rounded-br-md' : 'rounded-bl-md'} px-3 py-2 flex items-center gap-1.5`}>
                          <Loader className="w-3 h-3 text-emerald-500 animate-spin" />
                          <span className="text-[10px] text-gray-400">{a.aiReplying}</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                ) : (
                  <>
                {/* 非云端模式: 图片预览 — 仅在未开始分析时显示 */}
                {!detecting && !deepAnalyzing && !done && !deepAnalysisResult && !deepError && (
                <div className="flex justify-center">
                  <div className="relative w-44 h-44 rounded-2xl overflow-hidden shadow bg-gray-100 flex-shrink-0">
                    {done && results.length > 0 ? (
                      <canvas ref={canvasRef} className="w-full h-full object-cover block" />
                    ) : (
                      <>
                        <img src={image} alt="" className="w-full h-full object-cover block" />
                        {detecting && (
                          <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center gap-2">
                            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          </div>
                        )}
                      </>
                    )}
                    <button onClick={reset} className={`absolute top-1.5 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center active:scale-90 transition-transform ${isRTL ? 'left-1.5' : 'right-1.5'}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                )}
                  </>
                )}

                {/* 检测结果列表 */}
                {done && results.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <h3 className="text-sm font-bold text-gray-800 truncate min-w-0 flex-1">{a.detected} {results.length} {a.targets}</h3>
                      <button onClick={reset} className="flex items-center gap-1 text-xs text-emerald-600 font-medium flex-shrink-0 whitespace-nowrap">
                        <RefreshCw className="w-3 h-3 flex-shrink-0" />{a.redetect}
                      </button>
                    </div>
                    {results.map((det, i) => {
                      const colors = ['bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-red-100 text-red-700', 'bg-blue-100 text-blue-700', 'bg-violet-100 text-violet-700', 'bg-pink-100 text-pink-700'];
                      return (
                        <div key={i} className="bg-white rounded-xl shadow px-3 py-2.5 flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${colors[i % colors.length]}`}>
                            {i + 1}
                          </div>
                          <span className="font-bold text-gray-800 text-sm flex-1 truncate">{det.className}</span>
                          <span className="text-sm font-bold text-emerald-600 flex-shrink-0">{(det.score * 100).toFixed(1)}%</span>
                        </div>
                      );
                    })}

                  </div>
                )}

                {/* 无结果 */}
                {done && results.length === 0 && !cloudOnlyMode && (
                  <div className="bg-white rounded-2xl p-5 shadow text-center">
                    <p className="text-sm text-gray-600">{a.noTarget}</p>
                    <p className="text-xs text-gray-400 mt-1">{a.tryClearer}</p>
                  </div>
                )}

                {/* Deep Analysis — 按钮已移至底部，此处仅展示 loading/error/result */}
                {done && results.length > 0 && (deepAnalyzing || deepError || deepAnalysisResult) && (
                  <div className="space-y-2 pt-1">
                    {/* Loading state */}
                    {deepAnalyzing && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-5">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
                            <Sparkles className="w-6 h-6 text-white animate-pulse" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm text-emerald-700 font-medium">{a.deepAnalyzing}</p>
                          </div>
                          <div className="w-full bg-emerald-200 rounded-full h-1 overflow-hidden">
                            <div className="bg-emerald-600 h-1 rounded-full animate-[loading_2s_ease-in-out_infinite]" style={{ width: '60%', animation: 'loading 2s ease-in-out infinite' }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Error state */}
                    {deepError && (
                      <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          <span className="text-xs text-red-600 font-medium">{a.deepAnalysisError}</span>
                        </div>
                        <p className="text-[10px] text-red-400 mb-2">{deepError}</p>
                        <button
                          onClick={handleDeepAnalysis}
                          className="w-full flex items-center justify-center gap-2 bg-red-100 text-red-700 py-2.5 rounded-xl active:scale-[0.97] transition-transform text-xs font-medium"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />{a.deepAnalysisRetry}
                        </button>
                      </div>
                    )}

                    {/* Analysis Result */}
                    {deepAnalysisResult && (
                      <div className="bg-white rounded-2xl shadow-lg border border-emerald-100 overflow-hidden">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <Sparkles className="w-4 h-4 text-white flex-shrink-0" />
                            <span className="text-sm text-white font-medium truncate">{a.deepAnalysisResult}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {/* Copy button */}
                            <button
                              onClick={handleCopyReport}
                              className="flex items-center gap-1 text-[10px] text-white/80 hover:text-white bg-white/15 px-2 py-1 rounded-lg active:scale-95 transition-all"
                            >
                              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              {copied ? a.copied : a.copyReport}
                            </button>
                            {/* Collapse/Expand */}
                            <button
                              onClick={() => setDeepExpanded(!deepExpanded)}
                              className="text-white/80 hover:text-white p-1 rounded-lg active:scale-95 transition-all"
                            >
                              {deepExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Body */}
                        {deepExpanded && (
                          <div className="px-4 py-3 max-h-[400px] overflow-y-auto">
                            {renderMarkdown(deepAnalysisResult.analysis)}
                          </div>
                        )}

                        {/* Follow-up chat messages */}
                        {chatMessages.length > 0 && (
                          <div className="px-4 py-2 border-t border-gray-100 space-y-2 max-h-[300px] overflow-y-auto">
                            {chatMessages.map((msg, idx) => {
                              const isVoice = !!msg.voiceDuration;
                              const isPlaying = playingVoiceIdx === idx;
                              return (
                              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div 
                                  className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                                    msg.role === 'user'
                                      ? `bg-emerald-500 text-white ${isRTL ? 'rounded-bl-md' : 'rounded-br-md'}`
                                      : `bg-gray-100 text-gray-700 ${isRTL ? 'rounded-br-md' : 'rounded-bl-md'} cursor-pointer active:opacity-70`
                                  }`}
                                  onClick={() => msg.role === 'ai' && !msg.text.startsWith('⚠️') && handleAITextClick(msg.text)}
                                >
                                  {msg.image && (
                                    <img src={msg.image} alt="" className="max-w-44 max-h-48 w-auto h-auto rounded-xl mb-1" />
                                  )}
                                  {isVoice ? (
                                    <button
                                      className="flex items-center gap-2 min-w-[80px] w-full"
                                      onClick={(e) => { e.stopPropagation(); toggleVoicePlay(idx, msg.voiceDuration!); }}
                                    >
                                      {isPlaying
                                        ? <Pause className="w-3.5 h-3.5 flex-shrink-0" />
                                        : <Play className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" />
                                      }
                                      <div className="flex items-end gap-[2px] h-4">
                                        {[1.5, 3, 2, 3.5, 1.5, 3, 2].map((h, i) => (
                                          <div
                                            key={i}
                                            className={`w-[3px] rounded-full ${msg.role === 'user' ? 'bg-white/80' : 'bg-gray-500'}`}
                                            style={isPlaying ? {
                                              height: `${h * 4}px`,
                                              animation: `voiceWave 0.4s ease-in-out ${i * 0.07}s infinite alternate`,
                                            } : {
                                              height: `${h * 4}px`,
                                            }}
                                          />
                                        ))}
                                      </div>
                                      <span className="text-[10px] font-semibold flex-shrink-0">{msg.voiceDuration}"</span>
                                    </button>
                                  ) : msg.role === 'ai' ? (
                                    <div className="leading-relaxed" style={{ fontSize: 'clamp(13px, 3.5vw, 15px)' }}>{renderMarkdown(msg.text)}</div>
                                  ) : msg.text ? (
                                    <p className="leading-relaxed" style={{ fontSize: 'clamp(13px, 3.5vw, 15px)' }}>{msg.text}</p>
                                  ) : null}
                                </div>
                              </div>
                              );
                            })}
                            {chatReplying && (
                              <div className="flex justify-start">
                                <div className={`bg-gray-100 rounded-2xl ${isRTL ? 'rounded-br-md' : 'rounded-bl-md'} px-3 py-2 flex items-center gap-1.5`}>
                                  <Loader className="w-3 h-3 text-emerald-500 animate-spin" />
                                  <span className="text-[10px] text-gray-400">{a.aiReplying}</span>
                                </div>
                              </div>
                            )}
                            <div ref={chatEndRef} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          </>
        )}
      </div>

    </SecondaryView>
  );
}
export default AIAssistantPage;