// ============================================================================
// ai-vision-proxy — Cloud AI Vision Analysis Edge Function
// ============================================================================
//
// Proxies image analysis requests to cloud AI providers.
// The frontend NEVER touches API keys — all credentials are server-side secrets.
//
// Endpoints:
//   POST /ai-vision-proxy     — Analyze image / follow-up / voice follow-up
//   GET  /ai-vision-proxy/health — Health check
//
// Supported AI Providers:
//   - qwen       → Alibaba DashScope (qwen-vl series)
//   - gemini     → Google Gemini (gemini-2.0-flash etc.)
//   - openai     → OpenAI-compatible (GPT-4o, etc.)
//
// Request Types (determined by body fields):
//   1. Image analysis:   { image, detections, modelId, systemPrompt, maxTokens }
//   2. Text follow-up:   { followUp: true, userMessage, previousAnalysis, ... }
//   3. Voice follow-up:  { voiceFollowUp: true, audio, previousAnalysis, ... }
//
// Response (normalized):
//   { analysis, provider, model, confidence?, suggestions?, transcription? }
//
// Environment Variables (Supabase Dashboard > Edge Functions > Secrets):
//   AI_PROVIDER    — Provider name: qwen | gemini | openai  (default: qwen)
//   AI_API_KEY     — API key for the selected provider
//   AI_BASE_URL    — (Optional) Custom API base URL (for self-hosted / proxy)
//   AI_MODEL_ID    — (Optional) Default model ID override
//
// ============================================================================

// ---- CORS ----

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errResp(message: string, status = 400): Response {
  return json({ error: message }, status);
}

// ---- Route ----

function getRoute(req: Request): string {
  const url = new URL(req.url);
  return url.pathname.replace(/^\/ai-vision-proxy/, "") || "/";
}

// ---- Config ----

type AIProvider = "qwen" | "gemini" | "openai";

interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  modelId: string;
}

function getAIConfig(requestModelId?: string): AIConfig {
  const provider = (Deno.env.get("AI_PROVIDER") || "qwen") as AIProvider;
  const apiKey = Deno.env.get("AI_API_KEY") || "";

  // Default base URLs per provider
  const defaultBaseUrls: Record<AIProvider, string> = {
    qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    gemini: "https://generativelanguage.googleapis.com/v1beta",
    openai: "https://api.openai.com/v1",
  };

  // Default model IDs per provider
  const defaultModels: Record<AIProvider, string> = {
    qwen: "qwen-vl-plus",
    gemini: "gemini-2.0-flash",
    openai: "gpt-4o",
  };

  return {
    provider,
    apiKey,
    baseUrl: Deno.env.get("AI_BASE_URL") || defaultBaseUrls[provider] || defaultBaseUrls.qwen,
    modelId: Deno.env.get("AI_MODEL_ID") || requestModelId || defaultModels[provider] || "qwen-vl-plus",
  };
}

// ---- Main Handler ----

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const route = getRoute(req);
  const method = req.method;

  try {
    // GET /health
    if (route === "/health" && method === "GET") {
      const cfg = getAIConfig();
      return json({
        status: "ok",
        timestamp: new Date().toISOString(),
        provider: cfg.provider,
        modelId: cfg.modelId,
        configured: !!cfg.apiKey,
      });
    }

    // POST / — Main analysis endpoint
    if ((route === "/" || route === "") && method === "POST") {
      const body = await req.json();
      return await handleAnalysis(body);
    }

    return errResp(`Unknown route: ${method} ${route}`, 404);
  } catch (e: any) {
    console.error("[ai-vision-proxy] Unhandled error:", e);
    return errResp(e.message || "Internal server error", 500);
  }
});

// ============================================================================
// Analysis Handler — Routes to the correct AI provider
// ============================================================================

async function handleAnalysis(body: any): Promise<Response> {
  const cfg = getAIConfig(body.modelId);

  if (!cfg.apiKey) {
    return errResp(
      `AI provider '${cfg.provider}' not configured. Set AI_API_KEY in Edge Function secrets.`,
      500,
    );
  }

  // Determine request type
  if (body.voiceFollowUp) {
    return await handleVoiceFollowUp(cfg, body);
  }
  if (body.followUp) {
    return await handleTextFollowUp(cfg, body);
  }
  return await handleImageAnalysis(cfg, body);
}

// ============================================================================
// 1. Image Analysis
// ============================================================================

async function handleImageAnalysis(cfg: AIConfig, body: any): Promise<Response> {
  const { image, detections, systemPrompt, maxTokens } = body;

  if (!image) {
    return errResp("Missing 'image' field (base64 image data)");
  }

  // Build context from on-device detections
  const detectionContext = (detections || [])
    .map((d: any) => `${d.className} (confidence: ${(d.score * 100).toFixed(1)}%)`)
    .join(", ");

  const systemMsg = systemPrompt ||
    "You are an agricultural AI assistant specialized in crop disease and pest identification. " +
    "Analyze the provided image and give a detailed diagnosis in markdown format. " +
    "Include: disease/pest identification, severity assessment, recommended treatments, and prevention tips.";

  const userPrompt = detectionContext
    ? `On-device model detected: ${detectionContext}. Please provide a deep analysis of this crop image, confirm or correct the detection results, and give detailed treatment recommendations.`
    : "Please analyze this crop image. Identify any diseases, pests, or nutritional issues, and provide treatment recommendations.";

  const tokenLimit = maxTokens || 1024;

  switch (cfg.provider) {
    case "qwen":
      return await callQwen(cfg, systemMsg, userPrompt, image, tokenLimit);
    case "gemini":
      return await callGemini(cfg, systemMsg, userPrompt, image, tokenLimit);
    case "openai":
      return await callOpenAI(cfg, systemMsg, userPrompt, image, tokenLimit);
    default:
      return errResp(`Unsupported provider: ${cfg.provider}`);
  }
}

// ============================================================================
// 2. Text Follow-Up
// ============================================================================

async function handleTextFollowUp(cfg: AIConfig, body: any): Promise<Response> {
  const { userMessage, previousAnalysis, systemPrompt, maxTokens } = body;

  if (!userMessage) {
    return errResp("Missing 'userMessage'");
  }

  const systemMsg = systemPrompt ||
    "You are an agricultural AI assistant. Continue the conversation based on the previous analysis context. " +
    "Provide helpful, specific advice about crop management, disease treatment, or farming practices.";

  const messages = buildTextMessages(systemMsg, previousAnalysis, userMessage);
  const tokenLimit = maxTokens || 1024;

  switch (cfg.provider) {
    case "qwen":
      return await callQwenText(cfg, messages, tokenLimit);
    case "gemini":
      return await callGeminiText(cfg, messages, tokenLimit);
    case "openai":
      return await callOpenAIText(cfg, messages, tokenLimit);
    default:
      return errResp(`Unsupported provider: ${cfg.provider}`);
  }
}

// ============================================================================
// 3. Voice Follow-Up (audio → STT → text → AI reply)
// ============================================================================

async function handleVoiceFollowUp(cfg: AIConfig, body: any): Promise<Response> {
  const { audio, previousAnalysis, systemPrompt, maxTokens } = body;

  if (!audio) {
    return errResp("Missing 'audio' field (base64 audio data)");
  }

  // For providers that support native audio input (Gemini, GPT-4o-audio),
  // we can send audio directly. For others, we'd need a separate STT step.
  // Currently: Gemini and OpenAI support audio natively; Qwen needs STT proxy.

  // Strategy: Extract transcription + generate reply
  // For simplicity, we use the provider's multimodal capability if available,
  // otherwise fallback to describing the audio as a text prompt.

  const systemMsg = systemPrompt ||
    "You are an agricultural AI assistant. The user sent a voice message. " +
    "If you can understand the audio, transcribe it and respond. " +
    "If not, ask the user to type their question.";

  const tokenLimit = maxTokens || 1024;

  // Check if audio is base64 data URL
  const isDataUrl = audio.startsWith("data:");
  const mimeMatch = audio.match(/^data:(audio\/[^;]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : "audio/webm";
  const audioBase64 = isDataUrl ? audio.replace(/^data:[^;]+;base64,/, "") : audio;

  switch (cfg.provider) {
    case "gemini":
      // Gemini supports inline audio data
      return await callGeminiAudio(cfg, systemMsg, previousAnalysis, audioBase64, mimeType, tokenLimit);
    case "openai":
      // GPT-4o supports audio in input_audio format
      return await callOpenAIAudio(cfg, systemMsg, previousAnalysis, audioBase64, tokenLimit);
    case "qwen":
      // Qwen VL doesn't natively support audio — fallback to text
      return await callQwenText(cfg, [
        { role: "system", content: systemMsg },
        ...(previousAnalysis ? [{ role: "assistant", content: previousAnalysis }] : []),
        { role: "user", content: "[User sent a voice message. Audio transcription is not available for this provider. Please ask the user to type their question.]" },
      ], tokenLimit);
    default:
      return errResp(`Unsupported provider: ${cfg.provider}`);
  }
}

// ============================================================================
// Provider Implementations
// ============================================================================

// ---- Helper: Build text messages ----

function buildTextMessages(
  systemMsg: string,
  previousAnalysis: string | undefined,
  userMessage: string,
): { role: string; content: string }[] {
  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemMsg },
  ];
  if (previousAnalysis) {
    messages.push({ role: "assistant", content: previousAnalysis });
  }
  messages.push({ role: "user", content: userMessage });
  return messages;
}

// ---- Helper: Extract text from AI response ----

function extractText(data: any): string {
  // Try common response formats
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
  if (data.output?.text) return data.output.text;
  if (data.output?.choices?.[0]?.message?.content) return data.output.choices[0].message.content;
  if (data.candidates?.[0]?.content?.parts?.[0]?.text) return data.candidates[0].content.parts[0].text;
  if (data.text) return data.text;
  if (data.content) return data.content;
  if (typeof data === "string") return data;
  return "";
}

// ============================================================================
// Qwen / DashScope (OpenAI-compatible mode)
// ============================================================================
// Docs: https://help.aliyun.com/zh/dashscope/developer-reference/qwen-vl-plus
// Uses OpenAI-compatible endpoint: /compatible-mode/v1/chat/completions

async function callQwen(
  cfg: AIConfig,
  systemMsg: string,
  userPrompt: string,
  imageBase64: string,
  maxTokens: number,
): Promise<Response> {
  const url = `${cfg.baseUrl}/chat/completions`;

  // Clean base64 — DashScope accepts data URL format
  const imageUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const payload = {
    model: cfg.modelId,
    messages: [
      { role: "system", content: systemMsg },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: userPrompt },
        ],
      },
    ],
    max_tokens: maxTokens,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[ai-vision][Qwen] API error ${res.status}:`, errBody);
    return errResp(`Qwen API error: ${res.status} ${errBody}`, 502);
  }

  const data = await res.json();
  const analysis = extractText(data);

  return json({
    analysis,
    provider: "通义千问",
    model: cfg.modelId,
  });
}

async function callQwenText(
  cfg: AIConfig,
  messages: { role: string; content: any }[],
  maxTokens: number,
): Promise<Response> {
  const url = `${cfg.baseUrl}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.modelId.replace("-vl-", "-"), // Use text model for follow-ups
      messages,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[ai-vision][Qwen] Text API error ${res.status}:`, errBody);
    return errResp(`Qwen API error: ${res.status}`, 502);
  }

  const data = await res.json();
  return json({ analysis: extractText(data), provider: "通义千问", model: cfg.modelId });
}

// ============================================================================
// Google Gemini
// ============================================================================
// Docs: https://ai.google.dev/gemini-api/docs/vision
// Endpoint: POST /models/{model}:generateContent

async function callGemini(
  cfg: AIConfig,
  systemMsg: string,
  userPrompt: string,
  imageBase64: string,
  maxTokens: number,
): Promise<Response> {
  const model = cfg.modelId;
  const url = `${cfg.baseUrl}/models/${model}:generateContent?key=${cfg.apiKey}`;

  // Strip data URL prefix if present
  const cleanBase64 = imageBase64.replace(/^data:image\/[^;]+;base64,/, "");
  const mimeMatch = imageBase64.match(/^data:(image\/[^;]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";

  const payload = {
    system_instruction: { parts: [{ text: systemMsg }] },
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data: cleanBase64 } },
          { text: userPrompt },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: maxTokens },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[ai-vision][Gemini] API error ${res.status}:`, errBody);
    return errResp(`Gemini API error: ${res.status}`, 502);
  }

  const data = await res.json();
  const analysis = extractText(data);

  return json({ analysis, provider: "Gemini", model });
}

async function callGeminiText(
  cfg: AIConfig,
  messages: { role: string; content: string }[],
  maxTokens: number,
): Promise<Response> {
  const model = cfg.modelId;
  const url = `${cfg.baseUrl}/models/${model}:generateContent?key=${cfg.apiKey}`;

  // Convert OpenAI-style messages to Gemini format
  const systemInstruction = messages.find((m) => m.role === "system")?.content || "";
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[ai-vision][Gemini] Text API error ${res.status}:`, errBody);
    return errResp(`Gemini API error: ${res.status}`, 502);
  }

  const data = await res.json();
  return json({ analysis: extractText(data), provider: "Gemini", model });
}

async function callGeminiAudio(
  cfg: AIConfig,
  systemMsg: string,
  previousAnalysis: string | undefined,
  audioBase64: string,
  mimeType: string,
  maxTokens: number,
): Promise<Response> {
  const model = cfg.modelId;
  const url = `${cfg.baseUrl}/models/${model}:generateContent?key=${cfg.apiKey}`;

  const parts: any[] = [];
  if (previousAnalysis) {
    parts.push({ text: `Previous analysis context:\n${previousAnalysis}` });
  }
  parts.push({ inline_data: { mime_type: mimeType, data: audioBase64 } });
  parts.push({ text: "Please listen to this voice message and respond with helpful agricultural advice." });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemMsg }] },
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[ai-vision][Gemini] Audio API error ${res.status}:`, errBody);
    return errResp(`Gemini audio API error: ${res.status}`, 502);
  }

  const data = await res.json();
  return json({ analysis: extractText(data), provider: "Gemini", model });
}

// ============================================================================
// OpenAI / OpenAI-Compatible
// ============================================================================
// Docs: https://platform.openai.com/docs/guides/vision
// Endpoint: POST /chat/completions

async function callOpenAI(
  cfg: AIConfig,
  systemMsg: string,
  userPrompt: string,
  imageBase64: string,
  maxTokens: number,
): Promise<Response> {
  const url = `${cfg.baseUrl}/chat/completions`;

  // Ensure proper data URL format
  const imageUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const payload = {
    model: cfg.modelId,
    messages: [
      { role: "system", content: systemMsg },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          { type: "text", text: userPrompt },
        ],
      },
    ],
    max_tokens: maxTokens,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[ai-vision][OpenAI] API error ${res.status}:`, errBody);
    return errResp(`OpenAI API error: ${res.status}`, 502);
  }

  const data = await res.json();
  const analysis = extractText(data);

  return json({ analysis, provider: "OpenAI", model: cfg.modelId });
}

async function callOpenAIText(
  cfg: AIConfig,
  messages: { role: string; content: string }[],
  maxTokens: number,
): Promise<Response> {
  const url = `${cfg.baseUrl}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.modelId,
      messages,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[ai-vision][OpenAI] Text API error ${res.status}:`, errBody);
    return errResp(`OpenAI API error: ${res.status}`, 502);
  }

  const data = await res.json();
  return json({ analysis: extractText(data), provider: "OpenAI", model: cfg.modelId });
}

async function callOpenAIAudio(
  cfg: AIConfig,
  systemMsg: string,
  previousAnalysis: string | undefined,
  audioBase64: string,
  maxTokens: number,
): Promise<Response> {
  // GPT-4o supports audio via input_audio in the content array
  const url = `${cfg.baseUrl}/chat/completions`;

  const userContent: any[] = [];
  if (previousAnalysis) {
    userContent.push({ type: "text", text: `Previous analysis context:\n${previousAnalysis}` });
  }
  userContent.push({
    type: "input_audio",
    input_audio: { data: audioBase64, format: "webm" },
  });
  userContent.push({ type: "text", text: "Please listen to this voice message and respond with helpful agricultural advice." });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.modelId,
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: userContent },
      ],
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[ai-vision][OpenAI] Audio API error ${res.status}:`, errBody);
    // Fallback: if audio not supported, try as text
    if (res.status === 400) {
      return await callOpenAIText(cfg, [
        { role: "system", content: systemMsg },
        ...(previousAnalysis ? [{ role: "assistant", content: previousAnalysis }] : []),
        { role: "user", content: "[User sent a voice message. Audio transcription is not available. Please ask the user to type their question.]" },
      ], maxTokens);
    }
    return errResp(`OpenAI audio API error: ${res.status}`, 502);
  }

  const data = await res.json();
  return json({ analysis: extractText(data), provider: "OpenAI", model: cfg.modelId });
}
