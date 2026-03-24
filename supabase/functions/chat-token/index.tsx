// ============================================================================
// chat-token — IM Token Generation Edge Function
// ============================================================================
//
// Generates authentication tokens for IM providers.
// The frontend IM SDK needs a short-lived token to connect to the IM cloud.
// API keys / secrets are stored server-side — the frontend NEVER sees them.
//
// Endpoints:
//   POST /chat-token/token   — Generate IM token for a given provider + userId
//   GET  /chat-token/health  — Health check
//
// Supported Providers:
//   - tencent-im  → Generates UserSig (HMAC-SHA256 TLS ticket)
//   - cometchat   → Generates auth token via CometChat REST API
//
// Environment Variables (Supabase Dashboard > Edge Functions > Secrets):
//   TENCENT_IM_APP_ID       — Tencent IM SDKAppID (numeric)
//   TENCENT_IM_SECRET_KEY   — Tencent IM SecretKey (for UserSig generation)
//   COMETCHAT_APP_ID        — CometChat App ID
//   COMETCHAT_AUTH_KEY       — CometChat Auth Key (REST API Key)
//   COMETCHAT_REGION        — CometChat region (us/eu/in, default: us)
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

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

// ---- Route ----

function getRoute(req: Request): string {
  const url = new URL(req.url);
  return url.pathname.replace(/^\/chat-token/, "") || "/";
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
      return json({
        status: "ok",
        timestamp: new Date().toISOString(),
        providers: ["tencent-im", "cometchat"],
      });
    }

    // POST /token
    if (route === "/token" && method === "POST") {
      const body = await req.json();
      return await handleGenerateToken(body);
    }

    return err(`Unknown route: ${method} ${route}`, 404);
  } catch (e: any) {
    console.error("[chat-token] Unhandled error:", e);
    return err(e.message || "Internal server error", 500);
  }
});

// ============================================================================
// Token Generation
// ============================================================================

interface TokenRequest {
  uid: string;        // User ID
  provider: string;   // 'tencent-im' | 'cometchat'
  channelName?: string;
}

async function handleGenerateToken(body: TokenRequest): Promise<Response> {
  const { uid, provider, channelName } = body;

  if (!uid) return err("Missing 'uid'");
  if (!provider) return err("Missing 'provider'");

  switch (provider) {
    case "tencent-im":
      return await generateTencentIMToken(uid);
    case "cometchat":
      return await generateCometChatToken(uid);
    default:
      return err(`Unsupported provider: ${provider}`);
  }
}

// ============================================================================
// Tencent IM — UserSig Generation (HMAC-SHA256)
// ============================================================================
// UserSig is a TLS-based authentication ticket.
// Algorithm reference:
//   https://cloud.tencent.com/document/product/269/32688
//
// Steps:
//   1. Build a JSON content string with userId, appId, time, expire
//   2. HMAC-SHA256 sign the content with SecretKey
//   3. Combine signature + content → compress (zlib) → base64url encode
//
// The generated UserSig is valid for `expire` seconds (default 7 days).

async function generateTencentIMToken(userId: string): Promise<Response> {
  const appId = Deno.env.get("TENCENT_IM_APP_ID");
  const secretKey = Deno.env.get("TENCENT_IM_SECRET_KEY");

  if (!appId || !secretKey) {
    return err(
      "Tencent IM not configured. Set TENCENT_IM_APP_ID and TENCENT_IM_SECRET_KEY in Edge Function secrets.",
      500,
    );
  }

  const sdkAppId = Number(appId);
  if (!sdkAppId) {
    return err("Invalid TENCENT_IM_APP_ID (must be numeric)", 500);
  }

  try {
    const expire = 7 * 24 * 60 * 60; // 7 days in seconds
    const userSig = await genUserSig(sdkAppId, secretKey, userId, expire);

    return json({
      token: userSig,
      appId: String(sdkAppId),
      provider: "tencent-im",
      expiresIn: expire,
    });
  } catch (e: any) {
    console.error("[chat-token][TencentIM] UserSig generation failed:", e);
    return err(`UserSig generation failed: ${e.message}`, 500);
  }
}

/**
 * Generate Tencent IM UserSig using HMAC-SHA256.
 *
 * This is the standard server-side algorithm specified by Tencent Cloud:
 * https://cloud.tencent.com/document/product/269/32688#GeneratingdWithServerAPI
 */
async function genUserSig(
  sdkAppId: number,
  key: string,
  userId: string,
  expire: number,
): Promise<string> {
  const currTime = Math.floor(Date.now() / 1000);

  // Content object (must match Tencent's specified field names exactly)
  const sigDoc: Record<string, string | number> = {
    "TLS.ver": "2.0",
    "TLS.identifier": userId,
    "TLS.sdkappid": sdkAppId,
    "TLS.expire": expire,
    "TLS.time": currTime,
  };

  // Build the HMAC content string (specific field order required by Tencent)
  const contentToSign =
    `TLS.identifier:${userId}\n` +
    `TLS.sdkappid:${sdkAppId}\n` +
    `TLS.time:${currTime}\n` +
    `TLS.expire:${expire}\n`;

  // HMAC-SHA256 sign
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(contentToSign);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const signatureBase64 = btoa(
    String.fromCharCode(...new Uint8Array(signatureBuffer)),
  );

  // Add signature to the content document
  sigDoc["TLS.sig"] = signatureBase64;

  // JSON → UTF-8 → zlib compress → base64url
  const jsonStr = JSON.stringify(sigDoc);
  const jsonBytes = encoder.encode(jsonStr);

  // Use CompressionStream (available in Deno) for zlib/deflate
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  writer.write(jsonBytes);
  writer.close();

  const compressedChunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    compressedChunks.push(value);
  }

  // Concatenate chunks
  const totalLength = compressedChunks.reduce((s, c) => s + c.length, 0);
  const compressed = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of compressedChunks) {
    compressed.set(chunk, offset);
    offset += chunk.length;
  }

  // base64url encode (replace +/ with *_, no padding)
  const base64 = btoa(String.fromCharCode(...compressed));
  const base64url = base64
    .replace(/\+/g, "*")
    .replace(/\//g, "-")
    .replace(/=/g, "_");

  return base64url;
}

// ============================================================================
// CometChat — Auth Token via REST API
// ============================================================================
// CometChat requires creating/fetching a user token via their REST API.
// Reference: https://www.cometchat.com/docs/chat-apis/users/create-user
//
// Flow:
//   1. Try to create the user (idempotent — returns existing if already exists)
//   2. Create an auth token for the user
//
// REST API base: https://{appId}.api-{region}.cometchat.io/v3

async function generateCometChatToken(userId: string): Promise<Response> {
  const appId = Deno.env.get("COMETCHAT_APP_ID");
  const authKey = Deno.env.get("COMETCHAT_AUTH_KEY");
  const region = Deno.env.get("COMETCHAT_REGION") || "us";

  if (!appId || !authKey) {
    return err(
      "CometChat not configured. Set COMETCHAT_APP_ID and COMETCHAT_AUTH_KEY in Edge Function secrets.",
      500,
    );
  }

  const apiBase = `https://${appId}.api-${region}.cometchat.io/v3`;
  const headers = {
    "Content-Type": "application/json",
    appid: appId,
    apikey: authKey,
  };

  try {
    // Step 1: Ensure user exists (create if not — idempotent)
    const createUserRes = await fetch(`${apiBase}/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        uid: userId,
        name: userId, // Name can be updated later by the frontend
      }),
    });

    // 409 = user already exists (not an error)
    if (!createUserRes.ok && createUserRes.status !== 409) {
      const errBody = await createUserRes.text();
      // ERR_UID_ALREADY_EXISTS is also acceptable
      if (!errBody.includes("ERR_UID_ALREADY_EXISTS")) {
        console.error("[chat-token][CometChat] Create user failed:", errBody);
        return err(`CometChat create user failed: ${errBody}`, 500);
      }
    }

    // Step 2: Create auth token
    const tokenRes = await fetch(
      `${apiBase}/users/${userId}/auth_tokens`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      },
    );

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("[chat-token][CometChat] Token creation failed:", errBody);
      return err(`CometChat token creation failed: ${errBody}`, 500);
    }

    const tokenData = await tokenRes.json();
    const authToken = tokenData.data?.authToken;

    if (!authToken) {
      return err("CometChat returned empty auth token", 500);
    }

    return json({
      token: authToken,
      appId,
      provider: "cometchat",
      expiresIn: tokenData.data?.expiresIn || 86400,
    });
  } catch (e: any) {
    console.error("[chat-token][CometChat] Error:", e);
    return err(`CometChat error: ${e.message}`, 500);
  }
}
