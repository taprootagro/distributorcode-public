// ============================================================================
// Unified Edge Function — TaprootAgro PWA Backend
// ============================================================================
// This is the SINGLE Edge Function for the entire PWA.
// Each white-label deployment should deploy this to their own Supabase project.
//
// Endpoints:
//   GET  /server/health          — Health check
//   POST /server/send-code       — Send OTP verification code (phone/email)
//   POST /server/auth            — Verify OTP code + return userId & JWT
//   POST /server/oauth-exchange  — Exchange OAuth authorization code for token
//   GET  /server/profile         — Get user profile
//   POST /server/profile         — Save user profile
//   GET  /server/config          — Read remote app_config
//   POST /server/config          — Write remote app_config with optimistic locking
//   GET  /server/config/history  — List config version history
//   POST /server/config/rollback — Rollback to a previous config version
//   GET  /server/contacts        — List dealer's farmer contacts (requires JWT)
//   POST /server/contacts        — Add/upsert a farmer contact (requires JWT)
//   PATCH /server/contacts/:id   — Update a contact (mute, rename, etc.)
//   DELETE /server/contacts/:id  — Remove a contact
//   GET  /server/ledger          — Get dealer's ledger data (requires JWT)
//   POST /server/ledger          — Save dealer's ledger data (requires JWT)
//
// Environment variables (set in Supabase Dashboard > Edge Functions > Secrets):
//   SUPABASE_URL              — Auto-injected by Supabase
//   SUPABASE_ANON_KEY         — Auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — Auto-injected by Supabase
//
// Config writes (POST /config, GET /config/history, POST /config/rollback):
//   Production farmer PWA does not call these (pull-only). Operators use Dashboard
//   or scripts with CONFIG_WRITE_SECRET.
//   CONFIG_WRITE_SECRET       — Callers must send header X-Config-Write-Secret: <same>
//   ALLOW_INSECURE_PUBLIC_CONFIG_WRITE — "true" = anon-only writes (legacy / dev only)
//
// Profile (GET/POST /profile):
//   Requires Authorization: Bearer <user access_token> (not the anon key).
//   apikey header should still be the anon key (Supabase Edge convention).
//
// Required tables (see /supabase/migrations/001_init.sql + 002):
//   app_config       — Remote configuration (RLS: service_role only)
//   config_history   — Version snapshots for rollback (RLS: service_role only)
//   user_profiles    — User profile storage (RLS: service_role only)
//   dealer_contacts  — Dealer's farmer contacts (RLS: service_role only)
//   dealer_ledger    — Dealer's ledger/inventory data (RLS: service_role only)
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

// ---- Supabase clients ----

/** Admin client (service_role) — bypasses RLS, used for all DB operations */
function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Auth client (anon key + user JWT) — used for Supabase Auth operations */
function getAuthClient(authHeader?: string) {
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    authHeader
      ? { global: { headers: { Authorization: authHeader } } }
      : undefined,
  );
  return client;
}

// ---- CORS helpers ----

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info, x-config-write-secret",
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

// ---- Route extraction ----
// Edge Function is mounted at /server, so:
//   Full URL: https://xxx.supabase.co/functions/v1/server/config
//   req.url pathname: /server/config
//   We strip the /server prefix to get /config

function getRoute(req: Request): string {
  const url = new URL(req.url);
  // pathname = /server/config → strip /server → /config
  const path = url.pathname.replace(/^\/server/, "") || "/";
  return path;
}

/** Constant-time string compare for secrets */
function timingSafeEqualString(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  if (aBuf.length !== bBuf.length) return false;
  let diff = 0;
  for (let i = 0; i < aBuf.length; i++) diff |= aBuf[i]! ^ bBuf[i]!;
  return diff === 0;
}

/** Returns an error Response if config write is not allowed; null if OK */
function assertConfigWriteAllowed(req: Request): Response | null {
  if (Deno.env.get("ALLOW_INSECURE_PUBLIC_CONFIG_WRITE") === "true") {
    return null;
  }
  const secret = (Deno.env.get("CONFIG_WRITE_SECRET") || "").trim();
  if (secret.length < 16) {
    return err(
      "Config writes disabled: set CONFIG_WRITE_SECRET (≥16 chars) in Edge Function secrets, " +
        "or set ALLOW_INSECURE_PUBLIC_CONFIG_WRITE=true for legacy mode (not recommended).",
      403,
    );
  }
  const presented = (req.headers.get("X-Config-Write-Secret") || "").trim();
  if (!timingSafeEqualString(presented, secret)) {
    return err("Unauthorized: missing or invalid X-Config-Write-Secret", 401);
  }
  return null;
}

async function requireUserJwt(
  req: Request,
): Promise<{ user: { id: string } } | Response> {
  const authHeader = req.headers.get("Authorization") || "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim() || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!token || token === anon) {
    return err(
      "User session required: use Authorization Bearer <access_token> from login (not anon key)",
      401,
    );
  }
  const client = getAuthClient();
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) {
    return err("Invalid or expired session", 401);
  }
  return { user };
}

// ---- Main handler ----

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const route = getRoute(req);
  const method = req.method;

  try {
    // =============================================
    // GET /health — Health check
    // =============================================
    if (route === "/health" && method === "GET") {
      return json({
        status: "ok",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      });
    }

    // =============================================
    // GET /config — Read remote app_config
    // =============================================
    if (route === "/config" && method === "GET") {
      return await handleGetConfig();
    }

    // =============================================
    // POST /config — Write remote app_config
    // =============================================
    if (route === "/config" && method === "POST") {
      const denied = assertConfigWriteAllowed(req);
      if (denied) return denied;
      const body = await req.json();
      return await handlePostConfig(body);
    }

    // =============================================
    // GET /config/history — List config version history
    // =============================================
    if (route === "/config/history" && method === "GET") {
      const denied = assertConfigWriteAllowed(req);
      if (denied) return denied;
      const url = new URL(req.url);
      const limit = parseInt(url.searchParams.get("limit") || "20", 10);
      return await handleConfigHistory(limit);
    }

    // =============================================
    // POST /config/rollback — Rollback to a previous version
    // =============================================
    if (route === "/config/rollback" && method === "POST") {
      const denied = assertConfigWriteAllowed(req);
      if (denied) return denied;
      const body = await req.json();
      return await handleConfigRollback(body);
    }

    // =============================================
    // POST /send-code — Send OTP verification code
    // =============================================
    if (route === "/send-code" && method === "POST") {
      const body = await req.json();
      return await handleSendCode(body);
    }

    // =============================================
    // POST /auth — Verify OTP code + return userId
    // =============================================
    if (route === "/auth" && method === "POST") {
      const body = await req.json();
      return await handleAuth(body);
    }

    // =============================================
    // POST /oauth-exchange — Exchange OAuth code for token
    // =============================================
    if (route === "/oauth-exchange" && method === "POST") {
      const body = await req.json();
      return await handleOAuthExchange(body);
    }

    // =============================================
    // GET /profile — Get user profile
    // =============================================
    if (route === "/profile" && method === "GET") {
      const auth = await requireUserJwt(req);
      if (auth instanceof Response) return auth;
      return await handleGetProfile(auth.user.id);
    }

    // =============================================
    // POST /profile — Save user profile
    // =============================================
    if (route === "/profile" && method === "POST") {
      const auth = await requireUserJwt(req);
      if (auth instanceof Response) return auth;
      const body = await req.json();
      return await handlePostProfile(body, auth.user.id);
    }

    // =============================================
    // GET /contacts — List dealer's contacts
    // =============================================
    if (route === "/contacts" && method === "GET") {
      const auth = await requireUserJwt(req);
      if (auth instanceof Response) return auth;
      return await handleGetContacts(auth.user.id);
    }

    // =============================================
    // POST /contacts — Add or upsert a contact
    // =============================================
    if (route === "/contacts" && method === "POST") {
      const auth = await requireUserJwt(req);
      if (auth instanceof Response) return auth;
      const body = await req.json();
      return await handlePostContact(body, auth.user.id);
    }

    // =============================================
    // PATCH /contacts/:id — Update a contact (mute, etc.)
    // =============================================
    if (route.startsWith("/contacts/") && method === "PATCH") {
      const auth = await requireUserJwt(req);
      if (auth instanceof Response) return auth;
      const contactId = route.replace("/contacts/", "");
      const body = await req.json();
      return await handlePatchContact(contactId, body, auth.user.id);
    }

    // =============================================
    // DELETE /contacts/:id — Remove a contact
    // =============================================
    if (route.startsWith("/contacts/") && method === "DELETE") {
      const auth = await requireUserJwt(req);
      if (auth instanceof Response) return auth;
      const contactId = route.replace("/contacts/", "");
      return await handleDeleteContact(contactId, auth.user.id);
    }

    // =============================================
    // GET /ledger — Get dealer's ledger data
    // =============================================
    if (route === "/ledger" && method === "GET") {
      const auth = await requireUserJwt(req);
      if (auth instanceof Response) return auth;
      return await handleGetLedger(auth.user.id);
    }

    // =============================================
    // POST /ledger — Save dealer's ledger data
    // =============================================
    if (route === "/ledger" && method === "POST") {
      const auth = await requireUserJwt(req);
      if (auth instanceof Response) return auth;
      const body = await req.json();
      return await handlePostLedger(body, auth.user.id);
    }

    // =============================================
    // 404 — Unknown route
    // =============================================
    return err(`Unknown route: ${method} ${route}`, 404);
  } catch (e: any) {
    console.error("[EdgeFunction] Unhandled error:", e);
    return err(e.message || "Internal server error", 500);
  }
});

// ============================================================================
// Config handlers
// ============================================================================

async function handleGetConfig(): Promise<Response> {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from("app_config")
    .select("config, version, updated_at, updated_by")
    .eq("id", "main")
    .maybeSingle();

  if (error) {
    console.error("[config/GET] DB error:", error);
    return err(`Database error: ${error.message}`, 500);
  }

  if (!data) {
    // No row exists — first run, return null signal
    return json({ data: null });
  }

  return json({
    config: data.config,
    version: data.version,
    updatedAt: data.updated_at,
    updatedBy: data.updated_by,
  });
}

async function handlePostConfig(body: any): Promise<Response> {
  const { config, expectedVersion, note, updatedBy } = body;

  if (!config || typeof config !== "object") {
    return err("Missing or invalid 'config' field");
  }

  const admin = getAdminClient();

  // --- Step 1: Read current version for optimistic locking ---
  const { data: current, error: readErr } = await admin
    .from("app_config")
    .select("version")
    .eq("id", "main")
    .maybeSingle();

  if (readErr) {
    console.error("[config/POST] Read error:", readErr);
    return err(`Database error: ${readErr.message}`, 500);
  }

  const currentVersion = current?.version ?? 0;

  // --- Step 2: Optimistic lock check ---
  if (expectedVersion !== null && expectedVersion !== undefined) {
    if (currentVersion !== expectedVersion) {
      return json(
        {
          success: false,
          conflict: true,
          currentVersion,
          message: `Version conflict: expected ${expectedVersion}, current is ${currentVersion}`,
        },
        409,
      );
    }
  }

  // --- Step 3: Write config ---
  // Do NOT set `version` explicitly — the database trigger
  // (trg_app_config_auto_version) automatically increments it
  // when `config` changes. This avoids double-increment issues.
  if (current) {
    // Row exists → UPDATE (triggers fire on UPDATE)
    const { error: writeErr } = await admin
      .from("app_config")
      .update({
        config,
        updated_by: updatedBy || null,
      })
      .eq("id", "main");

    if (writeErr) {
      console.error("[config/POST] Write error:", writeErr);
      return err(`Database error: ${writeErr.message}`, 500);
    }
  } else {
    // No row yet → INSERT with version 1 (no trigger on insert)
    const { error: writeErr } = await admin.from("app_config").insert({
      id: "main",
      config,
      version: 1,
      updated_by: updatedBy || null,
    });

    if (writeErr) {
      console.error("[config/POST] Insert error:", writeErr);
      return err(`Database error: ${writeErr.message}`, 500);
    }
  }

  // --- Step 4: Read back actual version (set by trigger) ---
  const { data: updated } = await admin
    .from("app_config")
    .select("version, updated_at")
    .eq("id", "main")
    .single();

  // Note: config_history snapshot is created automatically by the
  // database trigger (trg_app_config_auto_history) on every UPDATE.
  // No manual INSERT into config_history is needed here.

  return json({
    success: true,
    newVersion: updated?.version ?? currentVersion + 1,
    updatedAt: updated?.updated_at ?? new Date().toISOString(),
  });
}

async function handleConfigHistory(limit: number): Promise<Response> {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from("config_history")
    .select("id, version, created_at, created_by, note")
    .order("version", { ascending: false })
    .limit(Math.min(limit, 100));

  if (error) {
    console.error("[config/history] DB error:", error);
    return err(`Database error: ${error.message}`, 500);
  }

  return json({ history: data || [] });
}

async function handleConfigRollback(body: any): Promise<Response> {
  const { version, rollbackBy } = body;

  if (typeof version !== "number") {
    return err("Missing or invalid 'version' field");
  }

  const admin = getAdminClient();

  // --- Step 1: Find the target version in config_history ---
  const { data: snapshot, error: findErr } = await admin
    .from("config_history")
    .select("config, version")
    .eq("version", version)
    .maybeSingle();

  if (findErr) {
    return err(`Database error: ${findErr.message}`, 500);
  }

  if (!snapshot) {
    return err(`Version ${version} not found in history`, 404);
  }

  // --- Step 2: Write the rolled-back config ---
  // Use UPDATE so the trigger auto-increments version and saves history.
  const { error: writeErr } = await admin
    .from("app_config")
    .update({
      config: snapshot.config,
      updated_by: rollbackBy || `rollback-to-v${version}`,
    })
    .eq("id", "main");

  if (writeErr) {
    return err(`Database error: ${writeErr.message}`, 500);
  }

  // Read back the new version (set by trigger)
  const { data: updated } = await admin
    .from("app_config")
    .select("version")
    .eq("id", "main")
    .single();

  return json({
    success: true,
    newVersion: updated?.version ?? 0,
    rolledBackTo: version,
  });
}

// ============================================================================
// Auth handlers
// ============================================================================

async function handleSendCode(body: any): Promise<Response> {
  const { method, credential } = body;

  if (!method || !credential) {
    return err("Missing 'method' or 'credential'");
  }

  if (method !== "phone" && method !== "email") {
    return err("method must be 'phone' or 'email'");
  }

  const authClient = getAuthClient();

  if (method === "phone") {
    const { error } = await authClient.auth.signInWithOtp({
      phone: credential,
    });
    if (error) {
      console.error("[send-code] Phone OTP error:", error);
      return err(error.message, 400);
    }
  } else {
    const { error } = await authClient.auth.signInWithOtp({
      email: credential,
    });
    if (error) {
      console.error("[send-code] Email OTP error:", error);
      return err(error.message, 400);
    }
  }

  return json({ success: true });
}

async function handleAuth(body: any): Promise<Response> {
  const { method, credential, code } = body;

  if (!method || !credential || !code) {
    return err("Missing 'method', 'credential', or 'code'");
  }

  const authClient = getAuthClient();

  let result;
  if (method === "phone") {
    result = await authClient.auth.verifyOtp({
      phone: credential,
      token: code,
      type: "sms",
    });
  } else {
    result = await authClient.auth.verifyOtp({
      email: credential,
      token: code,
      type: "email",
    });
  }

  if (result.error) {
    console.error("[auth] Verify OTP error:", result.error);
    return err(result.error.message, 401);
  }

  const session = result.data.session;
  const user = result.data.user;

  if (!user) {
    return err("Verification succeeded but no user returned", 500);
  }

  // Ensure user_profiles row exists
  const admin = getAdminClient();
  await admin.from("user_profiles").upsert(
    {
      user_id: user.id,
      profile: { phone: user.phone, email: user.email },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return json({
    userId: user.id,
    accessToken: session?.access_token || null,
    refreshToken: session?.refresh_token || null,
    expiresIn: session?.expires_in || null,
  });
}

async function handleOAuthExchange(body: any): Promise<Response> {
  const { provider, code, redirectUri } = body;

  if (!provider || !code) {
    return err("Missing 'provider' or 'code'");
  }

  const authClient = getAuthClient();

  // Exchange the OAuth authorization code for a session
  const { data, error } = await authClient.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[oauth-exchange] Error:", error);
    return err(error.message, 401);
  }

  const session = data.session;
  const user = data.user;

  if (!user) {
    return err("OAuth exchange succeeded but no user returned", 500);
  }

  // Ensure user_profiles row exists
  const admin = getAdminClient();
  await admin.from("user_profiles").upsert(
    {
      user_id: user.id,
      profile: {
        email: user.email,
        provider,
        avatar: user.user_metadata?.avatar_url || null,
        name: user.user_metadata?.full_name || user.user_metadata?.name || null,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return json({
    userId: user.id,
    accessToken: session?.access_token || null,
    refreshToken: session?.refresh_token || null,
    expiresIn: session?.expires_in || null,
  });
}

// ============================================================================
// Profile handlers
// ============================================================================

async function handleGetProfile(userId: string): Promise<Response> {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from("user_profiles")
    .select("profile, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[profile/GET] DB error:", error);
    return err(`Database error: ${error.message}`, 500);
  }

  if (!data) {
    return json({ profile: null });
  }

  return json({
    profile: data.profile,
    updatedAt: data.updated_at,
  });
}

async function handlePostProfile(
  body: any,
  authenticatedUserId: string,
): Promise<Response> {
  const { profile } = body;

  if (!profile || typeof profile !== "object") {
    return err("Missing or invalid 'profile' field");
  }

  const admin = getAdminClient();

  const { error } = await admin.from("user_profiles").upsert(
    {
      user_id: authenticatedUserId,
      profile,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[profile/POST] DB error:", error);
    return err(`Database error: ${error.message}`, 500);
  }

  return json({ success: true });
}

// ============================================================================
// Contact handlers (dealer_contacts CRUD)
// ============================================================================

async function handleGetContacts(dealerId: string): Promise<Response> {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from("dealer_contacts")
    .select("*")
    .eq("dealer_id", dealerId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[contacts/GET] DB error:", error);
    return err(`Database error: ${error.message}`, 500);
  }

  return json({ contacts: data || [] });
}

async function handlePostContact(
  body: any,
  dealerId: string,
): Promise<Response> {
  const {
    farmerName,
    farmerAvatar,
    imUserId,
    imProvider,
    channelId,
    phone,
    storeId,
    pinyin,
  } = body;

  if (!imUserId || !channelId) {
    return err("Missing required fields: imUserId, channelId");
  }

  const admin = getAdminClient();

  const row = {
    dealer_id: dealerId,
    farmer_name: farmerName || "",
    farmer_avatar: farmerAvatar || "",
    im_user_id: imUserId,
    im_provider: imProvider || "tencent-im",
    channel_id: channelId,
    phone: phone || "",
    store_id: storeId || "",
    pinyin: pinyin || "",
    bound_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("dealer_contacts")
    .upsert(row, { onConflict: "dealer_id,im_user_id" })
    .select()
    .single();

  if (error) {
    console.error("[contacts/POST] DB error:", error);
    return err(`Database error: ${error.message}`, 500);
  }

  return json({ success: true, contact: data });
}

async function handlePatchContact(
  contactId: string,
  body: any,
  dealerId: string,
): Promise<Response> {
  const admin = getAdminClient();

  const allowedFields: Record<string, string> = {
    farmerName: "farmer_name",
    farmerAvatar: "farmer_avatar",
    phone: "phone",
    pinyin: "pinyin",
    isMuted: "is_muted",
  };

  const updates: Record<string, unknown> = {};
  for (const [jsKey, dbCol] of Object.entries(allowedFields)) {
    if (body[jsKey] !== undefined) {
      updates[dbCol] = body[jsKey];
    }
  }

  if (Object.keys(updates).length === 0) {
    return err("No valid fields to update");
  }

  const { data, error } = await admin
    .from("dealer_contacts")
    .update(updates)
    .eq("id", contactId)
    .eq("dealer_id", dealerId)
    .select()
    .single();

  if (error) {
    console.error("[contacts/PATCH] DB error:", error);
    return err(`Database error: ${error.message}`, 500);
  }

  if (!data) {
    return err("Contact not found", 404);
  }

  return json({ success: true, contact: data });
}

async function handleDeleteContact(
  contactId: string,
  dealerId: string,
): Promise<Response> {
  const admin = getAdminClient();

  const { error } = await admin
    .from("dealer_contacts")
    .delete()
    .eq("id", contactId)
    .eq("dealer_id", dealerId);

  if (error) {
    console.error("[contacts/DELETE] DB error:", error);
    return err(`Database error: ${error.message}`, 500);
  }

  return json({ success: true });
}

// ============================================================================
// Ledger handlers (dealer_ledger — full-document sync)
// ============================================================================

async function handleGetLedger(dealerId: string): Promise<Response> {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from("dealer_ledger")
    .select("data, version, updated_at")
    .eq("dealer_id", dealerId)
    .maybeSingle();

  if (error) {
    console.error("[ledger/GET] DB error:", error);
    return err(`Database error: ${error.message}`, 500);
  }

  if (!data) {
    return json({ data: null, version: 0 });
  }

  return json({
    data: data.data,
    version: data.version,
    updatedAt: data.updated_at,
  });
}

async function handlePostLedger(
  body: any,
  dealerId: string,
): Promise<Response> {
  const { data: ledgerData, version: clientVersion } = body;

  if (!ledgerData || typeof ledgerData !== "object") {
    return err("Missing or invalid 'data' field");
  }

  const admin = getAdminClient();

  const { data: existing } = await admin
    .from("dealer_ledger")
    .select("version")
    .eq("dealer_id", dealerId)
    .maybeSingle();

  const serverVersion = existing?.version ?? 0;

  if (
    clientVersion !== null &&
    clientVersion !== undefined &&
    clientVersion < serverVersion
  ) {
    return json(
      {
        success: false,
        conflict: true,
        serverVersion,
        message: `Version conflict: client v${clientVersion}, server v${serverVersion}`,
      },
      409,
    );
  }

  const newVersion = serverVersion + 1;

  const { error } = await admin.from("dealer_ledger").upsert(
    {
      dealer_id: dealerId,
      data: ledgerData,
      version: newVersion,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "dealer_id" },
  );

  if (error) {
    console.error("[ledger/POST] DB error:", error);
    return err(`Database error: ${error.message}`, 500);
  }

  return json({ success: true, version: newVersion });
}