// ============================================================================
// CloudAIService - Cloud Vision AI Deep Analysis (Backend Proxy Pattern)
// ============================================================================
// This service sends images to a Supabase Edge Function for cloud AI analysis.
// The frontend NEVER touches any API keys — all provider credentials (Qwen,
// Gemini, OpenAI, etc.) are stored as server-side secrets in the Edge Function.
//
// When cloud AI is not configured, it falls back to a rich MOCK response
// to demonstrate the UI flow.
// ============================================================================

import { cloudAIGuard } from '../utils/cloudAIGuard';
import { storageGet } from '../utils/safeStorage';
import { getAccessToken } from '../utils/auth';
import { CONFIG_STORAGE_KEY } from '../constants';

export interface DeepAnalysisResult {
  provider: string;       // Display name (e.g. "通义千问", "Gemini")
  model: string;          // Model ID (e.g. "qwen-vl-plus")
  analysis: string;       // Markdown-formatted analysis text
  confidence?: number;    // Optional overall confidence (0-1)
  suggestions?: string[]; // Optional actionable suggestions
  timestamp: number;
}

// ---- Configuration (reads from safeStorage like ChatProxyService) ----
interface CloudAICfg {
  enabled: boolean;
  providerName: string;
  edgeFunctionName: string;
  modelId: string;
  systemPrompt: string;
  maxTokens: number;
}

interface BackendCfg {
  supabaseUrl: string;
  supabaseAnonKey: string;
  enabled: boolean;
}

function getCloudAIConfig(): CloudAICfg {
  const defaults: CloudAICfg = {
    enabled: false,
    providerName: "Cloud AI",
    edgeFunctionName: "ai-vision-proxy",
    modelId: "qwen-vl-plus",
    systemPrompt: "",
    maxTokens: 512,
  };
  try {
    const saved = storageGet(CONFIG_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const c = parsed.cloudAIConfig;
      if (c) {
        return {
          enabled: c.enabled ?? defaults.enabled,
          providerName: c.providerName || defaults.providerName,
          edgeFunctionName: c.edgeFunctionName || defaults.edgeFunctionName,
          modelId: c.modelId || defaults.modelId,
          systemPrompt: c.systemPrompt || defaults.systemPrompt,
          maxTokens: c.maxTokens || defaults.maxTokens,
        };
      }
    }
  } catch { /* ignore */ }
  return defaults;
}

function getBackendConfig(): BackendCfg {
  const defaults: BackendCfg = { supabaseUrl: "", supabaseAnonKey: "", enabled: false };
  try {
    const saved = storageGet(CONFIG_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const b = parsed.backendProxyConfig;
      if (b) {
        return {
          supabaseUrl: b.supabaseUrl || "",
          supabaseAnonKey: b.supabaseAnonKey || "",
          enabled: b.enabled ?? false,
        };
      }
    }
  } catch { /* ignore */ }
  return defaults;
}

function getEndpointUrl(): string {
  const cloud = getCloudAIConfig();
  const backend = getBackendConfig();
  if (cloud.enabled && backend.enabled && backend.supabaseUrl) {
    return `${backend.supabaseUrl}/functions/v1/${cloud.edgeFunctionName}`;
  }
  return "";
}

function getHeaders(): Record<string, string> {
  const backend = getBackendConfig();
  const accessToken = getAccessToken();
  return {
    "Content-Type": "application/json",
    // Authorization ONLY carries user's JWT — never fall back to anonKey.
    // If no accessToken, this header is omitted so the backend returns 401.
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    // apikey is always the anonKey (required by Supabase Edge Function gateway routing)
    ...(backend.supabaseAnonKey ? { apikey: backend.supabaseAnonKey } : {}),
  };
}

// ---- MOCK analysis (for demo when no backend) ----
function generateMockAnalysis(
  detections: { className: string; score: number }[]
): DeepAnalysisResult {
  const cfg = getCloudAIConfig();
  const detectionSummary = detections
    .map((d) => `${d.className} (${(d.score * 100).toFixed(0)}%)`)
    .join("、");

  const analysis = `## 深度分析报告

### 识别结果概览
端侧模型已检测到以下目标：**${detectionSummary}**

### 详细分析

${detections.map((d, i) => `#### ${i + 1}. ${d.className}
- **置信度**：${(d.score * 100).toFixed(1)}%
- **病害类型**：${d.score > 0.85 ? "典型症状，可确诊" : "疑似症状，建议进一步观察"}
- **危害程度**：${d.score > 0.9 ? "严重" : d.score > 0.75 ? "中等" : "轻微"}
- **发病阶段**：${d.score > 0.85 ? "中后期" : "初期"}
`).join("\n")}

### 防治建议
${detections.map((d, i) => `${i + 1}. **${d.className}**：建议使用对应的专业药剂进行防治，注意用药安全间隔期。可在TaprootAgro商城查看推荐产品。`).join("\n")}

### 农事提醒
- 建议定期巡田，及时发现病虫害。
- 合理轮作，减少病原菌积累。
- 注意田间排水，降低湿度以减少病害发生。`;

  return {
    provider: cfg.providerName,
    model: cfg.modelId,
    analysis,
    confidence: detections.length > 0 ? detections.reduce((s, d) => s + d.score, 0) / detections.length : 0,
    suggestions: [
      "建议使用对应药剂进行防治",
      "注意安全用药间隔期",
      "定期巡田，加强田间管理",
    ],
    timestamp: Date.now(),
  };
}

// ---- MOCK follow-up reply ----
function generateMockFollowUp(
  userMessage: string,
  previousAnalysis: string,
): string {
  // Simulate a contextual AI reply based on user's follow-up question
  const lowerMsg = userMessage.toLowerCase();
  if (lowerMsg.includes('药') || lowerMsg.includes('pesticide') || lowerMsg.includes('spray') || lowerMsg.includes('drug')) {
    return `### 用药建议补充

根据您提供的用药信息，以下是调整后的建议：

1. **避免重复用药**：如果近期已使用过相同成分的药剂，建议更换其他作用机制的药物，以防止抗药性产生。
2. **交替用药方案**：建议将保护性杀菌剂和治疗性杀菌剂交替使用，间隔7-10天。
3. **注意安全间隔期**：确保在采收前严格遵守各药剂的安全间隔期。
4. **施药方式**：建议在傍晚或阴天施药，避免高温时段，提高药效。

如需更具体的药剂推荐，请告诉我作物品种和当前生长阶段。`;
  }
  if (lowerMsg.includes('肥') || lowerMsg.includes('fertilizer') || lowerMsg.includes('nutrient')) {
    return `### 施肥与营养管理建议

结合病害情况，营养管理建议如下：

1. **增强抗病力**：适当增施钾肥和磷肥，提高植株抗病能力。
2. **避免偏施氮肥**：过多氮肥会导致徒长，增加染病风险。
3. **叶面补充**：可配合叶面喷施微量元素（如硼、锌），促进恢复。
4. **有机肥改良**：增施腐熟有机肥改善土壤微生态环境。`;
  }
  if (lowerMsg.includes('水') || lowerMsg.includes('浇') || lowerMsg.includes('irrigation') || lowerMsg.includes('water')) {
    return `### 水分管理建议

针对当前病害状，水分管理至关重要：

1. **控制田间湿度**：避免大水漫灌，采用滴灌或沟灌方式。
2. **排水畅通**：确保田间排水系统畅通，降低病原菌繁殖的湿度条件。
3. **灌溉时间**：建议在早晨灌溉，让叶面在白天尽快干燥。
4. **适度控水**：发病期间适当控制水量，配合通风降湿。`;
  }
  return `### 补充分析

感谢您提供的额外信息。根据您的描述"${userMessage}"，以下是进一步的建议：

1. **综合防治**：建议结合农业防治、物理防治和化学防治多种手段。
2. **持续观察**：密切关注病害发展趋势，如有扩散应及时加强防治。
3. **记录档案**：建议记录用药时、药剂名称和用量，建立田间管理档案。

如果您能提供更多细节（如使用过的农药、施肥情况、灌溉方式等），我可以给出更精准的建议。`;
}

// ---- Public API ----

class CloudAIService {
  /** Check if deep analysis feature is available (configured + enabled) */
  get isAvailable(): boolean {
    const cfg = getCloudAIConfig();
    return cfg.enabled;
  }

  /** Get display provider name */
  get providerName(): string {
    return getCloudAIConfig().providerName;
  }

  /** Check if running in real backend mode or mock */
  get mode(): "backend" | "mock" {
    return getEndpointUrl() ? "backend" : "mock";
  }

  /**
   * Perform deep analysis on an image with on-device detection results.
   *
   * @param imageBase64 - Base64-encoded image data (data:image/... format)
   * @param detections  - On-device detection results for context
   * @returns DeepAnalysisResult with markdown analysis text
   */
  async analyze(
    imageBase64: string,
    detections: { className: string; score: number }[]
  ): Promise<DeepAnalysisResult> {
    const endpoint = getEndpointUrl();
    const cfg = getCloudAIConfig();

    // ---- Frontend Guard Checks ----
    const preflight = cloudAIGuard.preflightCheck();
    if (preflight === 'DAILY_LIMIT') {
      throw new Error('DAILY_LIMIT_REACHED');
    }
    if (preflight === 'COOLDOWN') {
      const remaining = cloudAIGuard.getCooldownRemaining();
      throw new Error(`COOLDOWN:${remaining}`);
    }

    // ---- Image Compression ----
    console.log('[CloudAI] Compressing image before analysis...');
    const compressedImage = await cloudAIGuard.compressImage(imageBase64);

    // ---- Dedup Cache Check ----
    const cachedResultJson = await cloudAIGuard.checkDedup(compressedImage);
    if (cachedResultJson) {
      console.log('[CloudAI] Returning cached dedup result');
      const cached = JSON.parse(cachedResultJson) as DeepAnalysisResult;
      cached.timestamp = Date.now(); // refresh timestamp
      return cached;
    }

    if (endpoint) {
      // ---- Real Backend Proxy Call ----
      console.log(`[CloudAI] POST ${endpoint}`);
      try {
        // Add timeout to prevent hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

        const res = await fetch(endpoint, {
          method: "POST",
          headers: getHeaders(),
          signal: controller.signal,
          body: JSON.stringify({
            image: compressedImage,
            detections: detections.map((d) => ({
              className: d.className,
              score: d.score,
            })),
            modelId: cfg.modelId,
            systemPrompt: cfg.systemPrompt,
            maxTokens: cfg.maxTokens,
          }),
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(err.error || err.message || `Server responded with ${res.status}`);
        }

        const data = await res.json();

        // Robust response parsing: handle multiple AI provider response formats
        // Edge Function should normalize, but we handle common variants as fallback
        let analysisText = "";
        if (typeof data === "string") {
          // Edge Function returned raw string
          analysisText = data;
        } else if (data.analysis) {
          analysisText = data.analysis;
        } else if (data.text) {
          analysisText = data.text;
        } else if (data.content) {
          analysisText = data.content;
        } else if (data.result) {
          // Some providers wrap in .result
          analysisText = typeof data.result === "string" ? data.result : JSON.stringify(data.result);
        } else if (data.choices?.[0]?.message?.content) {
          // OpenAI-compatible format (if Edge Function passes through)
          analysisText = data.choices[0].message.content;
        } else if (data.output?.text) {
          // Qwen / DashScope format
          analysisText = data.output.text;
        } else if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          // Gemini format
          analysisText = data.candidates[0].content.parts[0].text;
        }

        if (!analysisText) {
          console.warn("[CloudAI] Could not extract analysis text from response:", data);
          analysisText = "The cloud AI returned a response but the analysis text could not be extracted. Raw response logged to console.";
        }

        const result: DeepAnalysisResult = {
          provider: data.provider || cfg.providerName,
          model: data.model || cfg.modelId,
          analysis: analysisText,
          confidence: data.confidence,
          suggestions: data.suggestions,
          timestamp: Date.now(),
        };

        // Record usage and cache result
        cloudAIGuard.recordCall();
        await cloudAIGuard.cacheResult(compressedImage, JSON.stringify(result));

        return result;
      } catch (error: any) {
        console.error("[CloudAI] Backend call failed:", error);
        // Provide user-friendly error messages
        if (error?.name === 'AbortError') {
          throw new Error('Request timed out (60s). The cloud AI service may be overloaded. Please try again later.');
        }
        if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
          throw new Error('Network error. Please check your internet connection and try again.');
        }
        throw error;
      }
    }

    // ---- Mock Mode ----
    console.log("[CloudAI][MOCK] Generating mock deep analysis");
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
    const mockResult = generateMockAnalysis(detections);

    // Record usage and cache even for mock
    cloudAIGuard.recordCall();
    await cloudAIGuard.cacheResult(compressedImage, JSON.stringify(mockResult));

    return mockResult;
  }

  /**
   * Generate a follow-up reply based on user's message and previous analysis.
   *
   * @param userMessage - User's follow-up question or comment
   * @param previousAnalysis - Previous analysis result in markdown format
   * @returns Follow-up reply in markdown format
   */
  async followUp(
    userMessage: string,
    previousAnalysis: string,
  ): Promise<string> {
    const endpoint = getEndpointUrl();
    const cfg = getCloudAIConfig();

    // ---- Frontend Guard Checks ----
    const preflight = cloudAIGuard.preflightCheck();
    if (preflight === 'DAILY_LIMIT') {
      throw new Error('DAILY_LIMIT_REACHED');
    }
    if (preflight === 'COOLDOWN') {
      const remaining = cloudAIGuard.getCooldownRemaining();
      throw new Error(`COOLDOWN:${remaining}`);
    }

    if (endpoint) {
      // ---- Real Backend Proxy Call ----
      console.log(`[CloudAI] Follow-up POST ${endpoint}`);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const res = await fetch(endpoint, {
          method: "POST",
          headers: getHeaders(),
          signal: controller.signal,
          body: JSON.stringify({
            followUp: true,
            userMessage,
            previousAnalysis,
            modelId: cfg.modelId,
            systemPrompt: cfg.systemPrompt,
            maxTokens: cfg.maxTokens,
          }),
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(err.error || err.message || `Server responded with ${res.status}`);
        }

        const data = await res.json();
        let replyText = "";
        if (typeof data === "string") replyText = data;
        else if (data.analysis) replyText = data.analysis;
        else if (data.text) replyText = data.text;
        else if (data.content) replyText = data.content;
        else if (data.choices?.[0]?.message?.content) replyText = data.choices[0].message.content;
        else if (data.output?.text) replyText = data.output.text;
        else replyText = JSON.stringify(data);

        cloudAIGuard.recordCall();
        return replyText;
      } catch (error: any) {
        console.error("[CloudAI] Follow-up call failed:", error);
        if (error?.name === 'AbortError') {
          throw new Error('Request timed out (60s). Please try again later.');
        }
        if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
          throw new Error('Network error. Please check your internet connection.');
        }
        throw error;
      }
    }

    // ---- Mock Mode ----
    console.log("[CloudAI][MOCK] Generating mock follow-up reply");
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
    cloudAIGuard.recordCall();
    return generateMockFollowUp(userMessage, previousAnalysis);
  }

  /**
   * Send a voice message (audio) to the cloud AI for speech understanding + reply.
   *
   * The backend Edge Function is expected to:
   *   1. Receive the audio base64 data
   *   2. Run STT (speech-to-text) via the AI provider
   *   3. Use the transcribed text + previousAnalysis context to generate a reply
   *   4. Return the reply text
   *
   * @param audioBase64 - Base64-encoded audio (data:audio/webm;... format)
   * @param previousAnalysis - Full conversation context for AI
   * @returns AI reply text
   */
  async voiceFollowUp(
    audioBase64: string,
    previousAnalysis: string,
  ): Promise<string> {
    const endpoint = getEndpointUrl();
    const cfg = getCloudAIConfig();

    // ---- Frontend Guard Checks ----
    const preflight = cloudAIGuard.preflightCheck();
    if (preflight === 'DAILY_LIMIT') {
      throw new Error('DAILY_LIMIT_REACHED');
    }
    if (preflight === 'COOLDOWN') {
      const remaining = cloudAIGuard.getCooldownRemaining();
      throw new Error(`COOLDOWN:${remaining}`);
    }

    if (endpoint) {
      // ---- Real Backend Proxy Call ----
      console.log(`[CloudAI] Voice follow-up POST ${endpoint} (audio size: ${Math.round(audioBase64.length / 1024)}KB)`);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s for voice (STT takes longer)

        const res = await fetch(endpoint, {
          method: "POST",
          headers: getHeaders(),
          signal: controller.signal,
          body: JSON.stringify({
            voiceFollowUp: true,
            audio: audioBase64,
            previousAnalysis,
            modelId: cfg.modelId,
            systemPrompt: cfg.systemPrompt,
            maxTokens: cfg.maxTokens,
          }),
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(err.error || err.message || `Server responded with ${res.status}`);
        }

        const data = await res.json();
        let replyText = "";
        if (typeof data === "string") replyText = data;
        else if (data.analysis) replyText = data.analysis;
        else if (data.text) replyText = data.text;
        else if (data.content) replyText = data.content;
        else if (data.reply) replyText = data.reply;
        else if (data.choices?.[0]?.message?.content) replyText = data.choices[0].message.content;
        else if (data.output?.text) replyText = data.output.text;
        else replyText = JSON.stringify(data);

        // If server also returns the transcribed text, prepend it
        if (data.transcription) {
          replyText = `> 🗣️ "${data.transcription}"\n\n${replyText}`;
        }

        cloudAIGuard.recordCall();
        return replyText;
      } catch (error: any) {
        console.error("[CloudAI] Voice follow-up call failed:", error);
        if (error?.name === 'AbortError') {
          throw new Error('Voice request timed out (90s). Please try again later.');
        }
        if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
          throw new Error('Network error. Please check your internet connection.');
        }
        throw error;
      }
    }

    // ---- Mock Mode ----
    console.log("[CloudAI][MOCK] Generating mock voice follow-up reply");
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
    cloudAIGuard.recordCall();
    return generateMockFollowUp("[Voice message from user about crop condition]", previousAnalysis);
  }
}

export const cloudAIService = new CloudAIService();