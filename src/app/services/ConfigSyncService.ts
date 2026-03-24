// ============================================================
// ConfigSyncService — Remote config sync via Edge Function
// ============================================================
// All reads and writes go through the unified Edge Function
// (POST /server/config, GET /server/config) which uses
// service_role internally — the frontend never directly
// touches the app_config table.
//
// The Edge Function is called with the anonKey in the `apikey`
// header (standard Supabase Edge Function auth).
//
// Remote config READ (GET /config): anon only — used by production farmer app.
//
// Remote config WRITE (POST /config): NOT used by production builds (farmer
// client is pull-only). Server still requires CONFIG_WRITE_SECRET or legacy
// ALLOW_INSECURE_PUBLIC_CONFIG_WRITE for any caller (e.g. curl, internal tools).
// White-label operators maintain app_config in Supabase Dashboard after launch.
//
// When supabaseUrl / anonKey are placeholder values, the
// service gracefully returns null / skips writes so the app
// works fully offline.
// ============================================================

const TAG = '[ConfigSync]';

/** Remove fields that must never be stored in app_config (defensive). */
function stripSecretsFromConfigForRemote(config: Record<string, any>): Record<string, any> {
  const c = JSON.parse(JSON.stringify(config)) as Record<string, any>;
  if (c.backendProxyConfig && typeof c.backendProxyConfig === 'object') {
    delete c.backendProxyConfig.configWriteSecret;
  }
  return c;
}

// ---- Credential validation ----

/**
 * Check whether a URL/key pair looks like real Supabase credentials
 * (i.e. not placeholder / empty / default template values).
 */
export function isSupabaseConfigured(url?: string, anonKey?: string): boolean {
  if (!url || !anonKey) return false;
  if (url.includes('your-supabase') || anonKey.includes('your-supabase')) return false;
  if (url === 'https://your-supabase-project.supabase.co') return false;
  if (anonKey === 'your-supabase-anon-key') return false;
  if (url.length < 20 || anonKey.length < 20) return false;
  try {
    new URL(url);
  } catch {
    return false;
  }
  return true;
}

// ---- Helpers ----

/**
 * Build the full Edge Function URL.
 * e.g. https://xxx.supabase.co/functions/v1/server/config
 */
function edgeFnUrl(
  supabaseUrl: string,
  edgeFunctionName: string,
  path: string,
): string {
  const base = supabaseUrl.replace(/\/+$/, '');
  return `${base}/functions/v1/${edgeFunctionName}${path}`;
}

/**
 * Standard headers for Edge Function calls.
 * Supabase requires the `apikey` header to authenticate the request.
 */
function edgeHeaders(anonKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'apikey': anonKey,
    // Authorization with anonKey as Bearer is the standard pattern
    // for Edge Functions when no user JWT is available
    'Authorization': `Bearer ${anonKey}`,
  };
}

// ---- Public API ----

export interface RemoteConfigResult {
  config: Record<string, any>;
  version: number;
  updatedAt: string;
}

/**
 * Fetch the remote config from Edge Function.
 * Returns null on any failure (network, not configured, etc.).
 */
export async function fetchRemoteConfig(
  supabaseUrl: string,
  supabaseAnonKey: string,
  edgeFunctionName: string = 'server',
): Promise<RemoteConfigResult | null> {
  if (!isSupabaseConfigured(supabaseUrl, supabaseAnonKey)) return null;

  try {
    const url = edgeFnUrl(supabaseUrl, edgeFunctionName, '/config');
    const res = await fetch(url, {
      method: 'GET',
      headers: edgeHeaders(supabaseAnonKey),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(TAG, 'fetch error:', res.status, errBody);
      return null;
    }

    const json = await res.json();

    // Edge Function returns { data: null } when no row exists
    if (json.data === null || (!json.config && !json.version)) {
      console.log(TAG, 'No remote config row found (first run?)');
      return null;
    }

    return {
      config: json.config as Record<string, any>,
      version: json.version as number,
      updatedAt: json.updatedAt as string,
    };
  } catch (err) {
    console.warn(TAG, 'fetch exception:', err);
    return null;
  }
}

export interface PushResult {
  success: boolean;
  newVersion: number;
  conflict?: boolean; // true if version mismatch
  /** Set when success is false (e.g. 401 missing write secret) */
  errorMessage?: string;
}

/**
 * Push config to remote via Edge Function with optimistic locking.
 *
 * @param expectedVersion  The version we last read. If the remote version
 *                         is different the write is rejected (conflict).
 *                         Pass `null` to force-write (skip version check).
 */
export async function pushRemoteConfig(
  supabaseUrl: string,
  supabaseAnonKey: string,
  config: Record<string, any>,
  expectedVersion: number | null,
  edgeFunctionName: string = 'server',
): Promise<PushResult> {
  if (!isSupabaseConfigured(supabaseUrl, supabaseAnonKey)) {
    return { success: false, newVersion: 0 };
  }

  try {
    const url = edgeFnUrl(supabaseUrl, edgeFunctionName, '/config');
    const res = await fetch(url, {
      method: 'POST',
      headers: edgeHeaders(supabaseAnonKey),
      body: JSON.stringify({
        config: stripSecretsFromConfigForRemote(config),
        expectedVersion,
      }),
    });

    const json = await res.json();

    if (res.status === 409 && json.conflict) {
      // Optimistic lock conflict
      console.warn(TAG, 'version conflict: expected', expectedVersion, 'got', json.currentVersion);
      return {
        success: false,
        newVersion: json.currentVersion ?? (expectedVersion ?? 0),
        conflict: true,
      };
    }

    if (!res.ok || !json.success) {
      const msg = json.error || res.statusText;
      console.warn(TAG, 'push error:', msg);
      return {
        success: false,
        newVersion: expectedVersion ?? 0,
        errorMessage: typeof msg === 'string' ? msg : undefined,
      };
    }

    console.log(TAG, 'push success, new version:', json.newVersion);
    return { success: true, newVersion: json.newVersion };
  } catch (err) {
    console.warn(TAG, 'push exception:', err);
    return { success: false, newVersion: expectedVersion ?? 0 };
  }
}

/**
 * Test connectivity to Supabase by calling the Edge Function health endpoint.
 * Returns { ok, latencyMs, error? }.
 *
 * Also probes /config to verify the app_config table exists.
 */
export async function testConnection(
  supabaseUrl: string,
  supabaseAnonKey: string,
  edgeFunctionName: string = 'server',
): Promise<{ ok: boolean; latencyMs: number; error?: string; tableExists?: boolean }> {
  if (!isSupabaseConfigured(supabaseUrl, supabaseAnonKey)) {
    return { ok: false, latencyMs: 0, error: 'Supabase not configured' };
  }

  const start = performance.now();
  try {
    // 1. Health check — verify Edge Function is deployed & reachable
    const healthUrl = edgeFnUrl(supabaseUrl, edgeFunctionName, '/health');
    const healthRes = await fetch(healthUrl, {
      method: 'GET',
      headers: edgeHeaders(supabaseAnonKey),
    });

    const latencyMs = Math.round(performance.now() - start);

    if (!healthRes.ok) {
      const errText = await healthRes.text();
      return {
        ok: false,
        latencyMs,
        error: `Edge Function responded ${healthRes.status}: ${errText}`,
      };
    }

    // 2. Config probe — verify app_config table exists
    const configUrl = edgeFnUrl(supabaseUrl, edgeFunctionName, '/config');
    const configRes = await fetch(configUrl, {
      method: 'GET',
      headers: edgeHeaders(supabaseAnonKey),
    });

    if (!configRes.ok) {
      const errBody = await configRes.text();
      // Table might not exist
      if (errBody.includes('relation') || errBody.includes('does not exist') || errBody.includes('42P01')) {
        return { ok: true, latencyMs, tableExists: false, error: 'Connected, but table "app_config" not found. Please run 001_init.sql.' };
      }
      return { ok: true, latencyMs, tableExists: false, error: `Config probe failed: ${errBody}` };
    }

    return { ok: true, latencyMs, tableExists: true };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return { ok: false, latencyMs, error: err.message || String(err) };
  }
}
