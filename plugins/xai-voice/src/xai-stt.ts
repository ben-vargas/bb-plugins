/**
 * xAI speech-to-text for bb's voice transcription AI service.
 *
 * Pure logic with injected dependencies so every path is unit-testable.
 * Two credential sources, in order:
 *
 *  1. `XAI_API_KEY` in the host daemon's environment — the documented
 *     API-key auth for `https://api.x.ai/v1/stt`.
 *  2. The Grok CLI's OAuth session in its auth store (`GROK_AUTH_PATH`,
 *     else `$GROK_HOME/auth.json`, else `~/.grok/auth.json` — the same
 *     resolution grok-build uses).
 *
 * OAuth access tokens live ~6h. This module NEVER refreshes or writes the
 * credential store itself: grok-build guards `auth.json` with a
 * cross-process flock and a one-shot rotating refresh token, and a second
 * writer that does not participate in that lock can corrupt the store or
 * burn the token family. Instead, an expired session is refreshed by
 * delegating to the CLI that owns the store: spawning
 * `grok sessions list -n 1`, whose first act is `try_ensure_fresh_auth` —
 * the CLI's real non-interactive refresh chain (flock, sibling adoption,
 * rotation, atomic persist) with no internal cancellation — and then
 * re-reading the store.
 *
 * The spawned CLI is never killed: a transcription whose budget runs out
 * while the refresh is still in flight fails with the `timeout` code and
 * leaves the refresh to finish, so the user's next dictation reads the
 * refreshed store.
 */
import type {
  XaiVoiceFailure,
  XaiVoiceStatus,
  XaiVoiceTextResult,
  XaiVoiceTranscribeInput,
} from "./host-contract.js";

/**
 * The AI service id this plugin registers, shown in Settings → AI services
 * and accepted by `bb settings ai-services set voice xai-voice`.
 */
export const XAI_VOICE_SERVICE_ID = "xai-voice";

/**
 * Treat a token as expired this long before `expires_at` — grok-build's
 * `DEFAULT_EARLY_INVALIDATION_SECS` (300s).
 */
const EXPIRY_BUFFER_MS = 300_000;

/** Below this remaining budget, report `timeout` instead of starting a refresh. */
const MIN_REFRESH_BUDGET_MS = 250;

export interface GrokRefreshOutcome {
  /** False only when the CLI could not be started at all (e.g. not on PATH). */
  ran: boolean;
  detail?: string;
}

export interface XaiSttDeps {
  fetchImpl: typeof fetch;
  /** Read a UTF-8 file; throw (e.g. ENOENT) when unreadable. */
  readTextFile(path: string): Promise<string>;
  /**
   * Run the Grok CLI's non-interactive refresh (`grok sessions list -n 1`)
   * to completion and resolve when it exits. MUST NOT kill the child on any
   * timeout — callers race this promise against their own budget instead —
   * and must resolve (never reject), with `ran: false` on a spawn failure.
   */
  runGrokRefresh(): Promise<GrokRefreshOutcome>;
  env: Record<string, string | undefined>;
  homeDir: string;
  now(): number;
}

/** One scope entry of the Grok auth store (fields this module reads). */
interface GrokAuthEntry {
  key: string;
  expires_at?: string;
  oidc_issuer?: string;
  oidc_client_id?: string;
}

type Failure = XaiVoiceFailure;

function failure(code: Failure["code"], message: string): Failure {
  return { ok: false, code, message };
}

const AUTH_HINT =
  "Set XAI_API_KEY on the host, or sign in with the Grok CLI (`grok`).";

const STATUS_HINT =
  "Set XAI_API_KEY on the primary machine, or run `grok` there to sign in";

// ── Grok auth store (read-only) ─────────────────────────────────────────────

/**
 * Same resolution as grok-build's `AuthManager::new`: a *defined*
 * `GROK_AUTH_PATH` is the path (even when empty — raw semantics, so the
 * plugin and the spawned CLI can never disagree), else `$GROK_HOME`, else
 * `~/.grok`. The host entry pins the child to this exact path too.
 */
export function resolveGrokAuthPath(
  env: Record<string, string | undefined>,
  homeDir: string,
): string {
  if (env.GROK_AUTH_PATH !== undefined) return env.GROK_AUTH_PATH;
  // grok-build filters an EMPTY GROK_HOME back to ~/.grok, while a defined
  // GROK_AUTH_PATH is always literal.
  const home = env.GROK_HOME ? env.GROK_HOME : `${homeDir}/.grok`;
  return `${home}/auth.json`;
}

function grokAuthPath(deps: XaiSttDeps): string {
  return resolveGrokAuthPath(deps.env, deps.homeDir);
}

function isEntry(value: unknown): value is GrokAuthEntry {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { key?: unknown }).key === "string" &&
    (value as { key: string }).key.length > 0
  );
}

function isExpired(entry: GrokAuthEntry, nowMs: number): boolean {
  if (typeof entry.expires_at === "string") {
    const expiresMs = Date.parse(entry.expires_at);
    if (!Number.isNaN(expiresMs)) return nowMs >= expiresMs - EXPIRY_BUFFER_MS;
  }
  // Missing or unparseable expires_at: optimistically valid (grok-build's
  // create-time fallback TTL is 30 days); the 401 recovery path self-heals.
  return false;
}

type GrokStore = Map<string, GrokAuthEntry>;

function parseStore(raw: string): GrokStore {
  const parsed = JSON.parse(raw) as unknown;
  const store: GrokStore = new Map();
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [scopeKey, value] of Object.entries(parsed)) {
      if (isEntry(value)) store.set(scopeKey, value);
    }
  }
  return store;
}

/**
 * Pick the xAI session deterministically. Scope keys are
 * `"<issuer>::<client-uuid>"`. Preference order:
 *   1. entries the Grok CLI just rotated (key changed vs `previous`,
 *      unexpired) — after a delegated refresh, the changed entry IS the
 *      CLI's active scope, whatever its position;
 *   2. entries whose scope key matches their own
 *      `oidc_issuer`/`oidc_client_id` (self-consistent, the shape
 *      grok-build writes);
 *   3. unexpired over expired;
 *   4. file order.
 * `exclude` drops a bearer that xAI already rejected (401 recovery).
 */
function pickGrokEntry(
  store: GrokStore,
  nowMs: number,
  previous?: GrokStore,
  exclude?: string,
): GrokAuthEntry | null {
  const candidates = [...store.entries()].filter(
    ([, entry]) => entry.key !== exclude,
  );
  if (candidates.length === 0) return null;
  const score = ([scopeKey, entry]: [string, GrokAuthEntry]): number => {
    const expired = isExpired(entry, nowMs);
    const rotated =
      previous !== undefined &&
      previous.has(scopeKey) &&
      previous.get(scopeKey)!.key !== entry.key &&
      !expired;
    const selfConsistent =
      typeof entry.oidc_issuer === "string" &&
      typeof entry.oidc_client_id === "string" &&
      scopeKey === `${entry.oidc_issuer}::${entry.oidc_client_id}`;
    return (rotated ? 4 : 0) + (selfConsistent ? 2 : 0) + (expired ? 0 : 1);
  };
  let best = candidates[0]!;
  let bestScore = score(best);
  for (const candidate of candidates.slice(1)) {
    const s = score(candidate);
    if (s > bestScore) {
      best = candidate;
      bestScore = s;
    }
  }
  return best[1];
}

async function readGrokStore(
  deps: XaiSttDeps,
): Promise<{ store: GrokStore } | { failure: Failure }> {
  let raw: string;
  try {
    raw = await deps.readTextFile(grokAuthPath(deps));
  } catch {
    return {
      failure: failure("auth_required", `No xAI credentials found. ${AUTH_HINT}`),
    };
  }
  try {
    return { store: parseStore(raw) };
  } catch {
    return {
      failure: failure(
        "auth_required",
        `Could not parse the Grok auth store. ${AUTH_HINT}`,
      ),
    };
  }
}

// ── Credential resolution ───────────────────────────────────────────────────

/**
 * Coalesce CLI-delegated refreshes per deps instance: concurrent
 * transcriptions join one in-flight spawn instead of racing. The promise
 * always runs to completion — joiners race it against their own budget and
 * abandon the wait, never the refresh.
 */
const inflightRefresh = new WeakMap<XaiSttDeps, Promise<GrokRefreshOutcome>>();

function refreshViaGrokCli(deps: XaiSttDeps): Promise<GrokRefreshOutcome> {
  const existing = inflightRefresh.get(deps);
  if (existing) return existing;
  const run = Promise.resolve()
    .then(() => deps.runGrokRefresh())
    .catch((error: unknown) => ({
      ran: false,
      detail: error instanceof Error ? error.message : String(error),
    }))
    .finally(() => {
      inflightRefresh.delete(deps);
    });
  inflightRefresh.set(deps, run);
  return run;
}

/** Race a promise against a wall-clock budget without cancelling it. */
async function raceBudget<T>(
  promise: Promise<T>,
  budgetMs: number,
): Promise<{ value: T } | { expired: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then((value) => ({ value })),
      new Promise<{ expired: true }>((resolve) => {
        timer = setTimeout(() => resolve({ expired: true }), budgetMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

interface ResolvedAuth {
  bearer: string;
  source: "api-key" | "grok-oauth";
}

/**
 * The 401 recovery path: xAI rejected `rejectedBearer` even though the
 * store considered it usable. NEVER delegate a refresh here — the CLI's
 * `try_ensure_fresh_auth` fast-paths a locally-unexpired token (no refresh
 * happens), and the sessions command's own remote 401 recovery runs inside
 * a cancellable five-second wrapper, exactly the mid-exchange hazard this
 * plugin exists to avoid. Instead, retry with the best *other* unexpired
 * entry (the wrong-scope case), or report the sign-in problem.
 */
async function resolveAuthAfterRejection(
  deps: XaiSttDeps,
  rejectedBearer: string,
): Promise<{ auth: ResolvedAuth } | { failure: Failure }> {
  const read = await readGrokStore(deps);
  if ("failure" in read) return read;
  const alternative = pickGrokEntry(
    read.store,
    deps.now(),
    undefined,
    rejectedBearer,
  );
  if (alternative && !isExpired(alternative, deps.now())) {
    return { auth: { bearer: alternative.key, source: "grok-oauth" } };
  }
  return {
    failure: failure(
      "auth_required",
      `xAI rejected the Grok session (HTTP 401). Run \`grok\` on the host to sign in again.`,
    ),
  };
}

/**
 * Resolve a bearer within the caller's live budget (`remaining()` is
 * re-read after every await, so a slow store read cannot let the refresh
 * overrun the request deadline), delegating a *locally expired* Grok
 * session to the CLI's own refresh. A refresh that outlives the budget
 * returns the `timeout` code — the CLI finishes on its own and the next
 * attempt reads its work.
 */
async function resolveAuth(
  deps: XaiSttDeps,
  remaining: () => number,
): Promise<{ auth: ResolvedAuth } | { failure: Failure }> {
  const apiKey = deps.env.XAI_API_KEY?.trim();
  if (apiKey) {
    return { auth: { bearer: apiKey, source: "api-key" } };
  }

  const first = await readGrokStore(deps);
  if ("failure" in first) return first;
  let entry = pickGrokEntry(first.store, deps.now());
  if (!entry) {
    return {
      failure: failure(
        "auth_required",
        `No Grok session in the auth store. ${AUTH_HINT}`,
      ),
    };
  }

  if (isExpired(entry, deps.now())) {
    const budgetMs = remaining();
    if (budgetMs < MIN_REFRESH_BUDGET_MS) {
      return {
        failure: failure(
          "timeout",
          "No time left to refresh the Grok session; try again to use a fresh one.",
        ),
      };
    }
    const raced = await raceBudget(refreshViaGrokCli(deps), budgetMs);
    if ("expired" in raced) {
      return {
        failure: failure(
          "timeout",
          "The Grok session refresh is still running; try again to use the refreshed session.",
        ),
      };
    }
    if (!raced.value.ran) {
      return {
        failure: failure(
          "auth_required",
          `Grok session expired and the grok CLI could not be run${raced.value.detail ? ` (${raced.value.detail})` : ""}. ${AUTH_HINT}`,
        ),
      };
    }
    const reread = await readGrokStore(deps);
    if ("failure" in reread) return reread;
    entry = pickGrokEntry(reread.store, deps.now(), first.store);
    if (!entry || isExpired(entry, deps.now())) {
      return {
        failure: failure(
          "auth_required",
          "Grok session expired and the Grok CLI did not produce a fresh one. Run `grok` on the host to sign in again.",
        ),
      };
    }
  }
  return { auth: { bearer: entry.key, source: "grok-oauth" } };
}

// ── Transcription ───────────────────────────────────────────────────────────

function sttUrl(deps: XaiSttDeps): string {
  const override = deps.env.XAI_STT_URL?.trim();
  return override && override.length > 0 ? override : "https://api.x.ai/v1/stt";
}

function isAbortLike(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

function networkFailure(error: unknown, what: string): Failure {
  if (isAbortLike(error)) return failure("timeout", `${what} timed out.`);
  const detail = error instanceof Error ? error.message : String(error);
  return failure("service_unavailable", `${what} failed: ${detail}`);
}

/** Read a response body as text, mapping an abort mid-read to `timeout`. */
async function readBodyText(
  response: Response,
  what: string,
): Promise<{ text: string } | { failure: Failure }> {
  try {
    return { text: await response.text() };
  } catch (error) {
    if (isAbortLike(error)) {
      return { failure: failure("timeout", `${what} timed out.`) };
    }
    return {
      failure: failure("invalid_response", `${what} body could not be read.`),
    };
  }
}

async function postAudio(
  input: XaiVoiceTranscribeInput,
  bearer: string,
  deps: XaiSttDeps,
  signal: AbortSignal,
): Promise<{ response: Response } | { failure: Failure }> {
  const bytes = Buffer.from(input.audioBase64, "base64");
  if (bytes.length === 0) {
    return { failure: failure("request_failed", "Audio payload was empty.") };
  }
  const form = new FormData();
  // xAI requires the file as the last multipart field; it is the only one.
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: input.mimeType }),
    input.filename,
  );
  try {
    const response = await deps.fetchImpl(sttUrl(deps), {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}` },
      body: form,
      signal,
    });
    return { response };
  } catch (error) {
    return { failure: networkFailure(error, "xAI transcription") };
  }
}

async function mapErrorResponse(response: Response): Promise<Failure> {
  const body = await readBodyText(response, "xAI transcription error");
  if ("failure" in body && body.failure.code === "timeout") {
    return body.failure;
  }
  const detail = ("text" in body ? body.text : "").slice(0, 200);
  switch (true) {
    case response.status === 401 || response.status === 403:
      return failure(
        "auth_required",
        `xAI rejected the credentials (HTTP ${response.status}). ${AUTH_HINT}`,
      );
    case response.status === 429:
      return failure("rate_limited", `xAI rate limit (HTTP 429). ${detail}`);
    case response.status >= 500:
      return failure(
        "service_unavailable",
        `xAI transcription is unavailable (HTTP ${response.status}).`,
      );
    default:
      return failure(
        "request_failed",
        `xAI transcription failed (HTTP ${response.status}). ${detail}`,
      );
  }
}

/**
 * Whether transcription can plausibly run: an API key, or a Grok auth store
 * holding at least one session. An expired session still counts — the Grok
 * CLI refreshes it on first use — so bb keeps the microphone visible.
 */
export async function readXaiVoiceStatus(
  deps: XaiSttDeps,
): Promise<XaiVoiceStatus> {
  if (deps.env.XAI_API_KEY?.trim()) return { ready: true };
  const read = await readGrokStore(deps);
  if ("failure" in read || read.store.size === 0) {
    return { ready: false, message: STATUS_HINT };
  }
  return { ready: true };
}

/**
 * Transcribe one audio clip. The whole operation — CLI-delegated credential
 * refresh included — is bounded by `input.timeoutMs` and by `requestSignal`
 * (bb cancelling the request); a refresh that outlives the budget is
 * abandoned (not killed) with the `timeout` code.
 */
export async function transcribeXaiVoice(
  input: XaiVoiceTranscribeInput,
  deps: XaiSttDeps,
  requestSignal?: AbortSignal,
): Promise<XaiVoiceTextResult> {
  const startedAt = deps.now();
  const deadline = startedAt + input.timeoutMs;
  const timeoutSignal = AbortSignal.timeout(input.timeoutMs);
  const signal = requestSignal
    ? AbortSignal.any([timeoutSignal, requestSignal])
    : timeoutSignal;
  const remaining = () => deadline - deps.now();

  const resolved = await resolveAuth(deps, remaining);
  if ("failure" in resolved) return resolved.failure;

  let posted = await postAudio(input, resolved.auth.bearer, deps, signal);
  if ("failure" in posted) return posted.failure;
  let { response } = posted;

  // A 401 on an OAuth bearer that the store considered valid: retry once
  // with the best other unexpired entry (the wrong-scope case), never with
  // a delegated refresh — see resolveAuthAfterRejection. 403 is a
  // permission problem no credential change can fix.
  if (response.status === 401 && resolved.auth.source === "grok-oauth") {
    const reresolved = await resolveAuthAfterRejection(
      deps,
      resolved.auth.bearer,
    );
    if ("failure" in reresolved) return reresolved.failure;
    posted = await postAudio(input, reresolved.auth.bearer, deps, signal);
    if ("failure" in posted) return posted.failure;
    response = posted.response;
  }

  if (!response.ok) return mapErrorResponse(response);

  const body = await readBodyText(response, "xAI transcription");
  if ("failure" in body) return body.failure;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.text);
  } catch {
    return failure("invalid_response", "xAI returned unparseable JSON.");
  }
  const text =
    parsed !== null && typeof parsed === "object"
      ? (parsed as { text?: unknown }).text
      : undefined;
  if (typeof text !== "string") {
    return failure("invalid_response", "xAI response had no text field.");
  }
  return { ok: true, text };
}
