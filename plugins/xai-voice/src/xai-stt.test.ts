import { describe, expect, it } from "vitest";
import type { ExperimentalAiVoiceTranscribeInput } from "@get-bb/plugin-sdk/ai-services";
import {
  transcribeXaiVoice,
  type GrokRefreshOutcome,
  type XaiSttDeps,
} from "./xai-stt.js";

const NOW = Date.parse("2026-08-25T12:00:00Z");
const HOME = "/home/tester";
const AUTH_PATH = `${HOME}/.grok/auth.json`;
const ISSUER = "https://auth.x.ai";
const CLIENT = "client-uuid";
const SCOPE = `${ISSUER}::${CLIENT}`;

const INPUT: ExperimentalAiVoiceTranscribeInput = {
  serviceId: "xai-voice",
  model: "grok-stt",
  audioBase64: Buffer.from("RIFF-fake-wav-bytes").toString("base64"),
  mimeType: "audio/webm",
  filename: "recording.webm",
  prompt: null,
  timeoutMs: 10_000,
};

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Ordered fake fetch plus a scripted auth store: `authFiles` maps a path to
 * a queue of file contents consumed one read at a time (last one repeats),
 * and `onRefresh` runs when the fake CLI delegation fires.
 */
function makeDeps(options: {
  env?: Record<string, string | undefined>;
  authFiles?: Partial<Record<string, Array<string>>>;
  responses: Array<(request: RecordedRequest) => Response>;
  onRefresh?: () => GrokRefreshOutcome | Promise<GrokRefreshOutcome>;
}) {
  const requests: RecordedRequest[] = [];
  let refreshCalls = 0;
  const authFiles = new Map<string, string[]>(
    Object.entries(options.authFiles ?? {}).map(([path, files]) => [
      path,
      [...(files ?? [])],
    ]),
  );
  const deps: XaiSttDeps = {
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request: RecordedRequest = {
        url: String(input),
        method: init?.method ?? "GET",
        headers: Object.fromEntries(
          Object.entries((init?.headers as Record<string, string>) ?? {}),
        ),
        body: init?.body,
      };
      requests.push(request);
      const responder = options.responses.shift();
      if (!responder) throw new Error(`Unexpected fetch: ${request.url}`);
      return responder(request);
    }) as typeof fetch,
    readTextFile: async (path) => {
      const queue = authFiles.get(path);
      if (queue && queue.length > 0) {
        return queue.length > 1 ? queue.shift()! : queue[0]!;
      }
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
    },
    runGrokRefresh: async () => {
      refreshCalls += 1;
      return options.onRefresh ? options.onRefresh() : { ran: true };
    },
    env: options.env ?? {},
    homeDir: HOME,
    now: () => NOW,
  };
  return { deps, requests, refreshCallCount: () => refreshCalls };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function authFile(
  entry: Record<string, unknown>,
  scope: string = SCOPE,
): string {
  return JSON.stringify({ [scope]: entry });
}

const VALID_ENTRY = {
  key: "session-bearer",
  auth_mode: "oidc",
  refresh_token: "rt-1",
  create_time: new Date(NOW - 60_000).toISOString(),
  expires_at: new Date(NOW + 3_600_000).toISOString(),
  oidc_issuer: ISSUER,
  oidc_client_id: CLIENT,
  user_id: "user-1",
};

const EXPIRED_ENTRY = {
  ...VALID_ENTRY,
  expires_at: new Date(NOW - 1000).toISOString(),
};

describe("transcribeXaiVoice", () => {
  it("uses XAI_API_KEY when set, ignoring the grok store", async () => {
    const { deps, requests, refreshCallCount } = makeDeps({
      env: { XAI_API_KEY: " sk-key " },
      authFiles: { [AUTH_PATH]: [authFile({ ...VALID_ENTRY, key: "oauth-key" })] },
      responses: [() => json(200, { text: "hello world", duration: 1.2 })],
    });
    const result = await transcribeXaiVoice(INPUT, deps);
    expect(result).toEqual({ ok: true, model: "grok-stt", text: "hello world" });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("https://api.x.ai/v1/stt");
    expect(requests[0]!.headers.authorization).toBe("Bearer sk-key");
    expect(refreshCallCount()).toBe(0);
  });

  it("uses a valid grok OAuth bearer without spawning the CLI", async () => {
    const { deps, requests, refreshCallCount } = makeDeps({
      authFiles: { [AUTH_PATH]: [authFile(VALID_ENTRY)] },
      responses: [() => json(200, { text: "via oauth" })],
    });
    const result = await transcribeXaiVoice(INPUT, deps);
    expect(result).toEqual({ ok: true, model: "grok-stt", text: "via oauth" });
    expect(requests[0]!.headers.authorization).toBe("Bearer session-bearer");
    expect(refreshCallCount()).toBe(0);
  });

  it("resolves the store like grok-build: GROK_AUTH_PATH, then GROK_HOME", async () => {
    for (const [env, path] of [
      [{ GROK_AUTH_PATH: "/etc/grok/custom-auth.json" }, "/etc/grok/custom-auth.json"],
      [{ GROK_HOME: "/srv/grokhome" }, "/srv/grokhome/auth.json"],
    ] as const) {
      const { deps, requests } = makeDeps({
        env,
        authFiles: { [path]: [authFile(VALID_ENTRY)] },
        responses: [() => json(200, { text: "found" })],
      });
      const result = await transcribeXaiVoice(INPUT, deps);
      expect(result).toMatchObject({ ok: true, text: "found" });
      expect(requests.at(-1)!.headers.authorization).toBe("Bearer session-bearer");
    }
  });

  it("treats a defined-but-empty GROK_AUTH_PATH literally, like grok-build", async () => {
    const { deps } = makeDeps({
      env: { GROK_AUTH_PATH: "" },
      authFiles: { [AUTH_PATH]: [authFile(VALID_ENTRY)] },
      responses: [],
    });
    const result = await transcribeXaiVoice(INPUT, deps);
    expect(result).toMatchObject({ ok: false, code: "auth_required" });
  });

  it("treats an empty GROK_HOME as unset, like grok-build", async () => {
    const { deps, requests } = makeDeps({
      env: { GROK_HOME: "" },
      authFiles: { [AUTH_PATH]: [authFile(VALID_ENTRY)] },
      responses: [() => json(200, { text: "default home" })],
    });
    const result = await transcribeXaiVoice(INPUT, deps);
    expect(result).toMatchObject({ ok: true, text: "default home" });
    expect(requests[0]!.headers.authorization).toBe("Bearer session-bearer");
  });

  it("counts a slow store read against the refresh budget", async () => {
    const { deps, refreshCallCount } = makeDeps({
      authFiles: { [AUTH_PATH]: [authFile(EXPIRED_ENTRY)] },
      responses: [],
    });
    const baseRead = deps.readTextFile;
    let clock = NOW;
    deps.now = () => clock;
    deps.readTextFile = async (path) => {
      clock += 9_900; // the read alone nearly exhausts a 10s budget
      return baseRead(path);
    };
    const result = await transcribeXaiVoice(INPUT, deps);
    expect(result).toMatchObject({ ok: false, code: "timeout" });
    expect(refreshCallCount()).toBe(0);
  });

  it("delegates an expired session to the grok CLI and re-reads the store", async () => {
    const { deps, requests, refreshCallCount } = makeDeps({
      authFiles: {
        [AUTH_PATH]: [
          authFile(EXPIRED_ENTRY),
          authFile({
            ...VALID_ENTRY,
            key: "cli-refreshed",
            expires_at: new Date(NOW + 21_600_000).toISOString(),
          }),
        ],
      },
      responses: [() => json(200, { text: "refreshed" })],
    });
    const result = await transcribeXaiVoice(INPUT, deps);
    expect(result).toEqual({ ok: true, model: "grok-stt", text: "refreshed" });
    expect(refreshCallCount()).toBe(1);
    expect(requests[0]!.headers.authorization).toBe("Bearer cli-refreshed");
  });

  it("treats a missing expires_at as valid instead of refreshing", async () => {
    const { deps, refreshCallCount } = makeDeps({
      authFiles: {
        [AUTH_PATH]: [
          authFile({
            ...VALID_ENTRY,
            key: "no-expiry",
            expires_at: undefined,
            create_time: new Date(NOW - 7 * 60 * 60 * 1000).toISOString(),
          }),
        ],
      },
      responses: [() => json(200, { text: "optimistic" })],
    });
    const result = await transcribeXaiVoice(INPUT, deps);
    expect(result).toMatchObject({ ok: true, text: "optimistic" });
    expect(refreshCallCount()).toBe(0);
  });

  it("fails with auth_required when the CLI cannot be spawned", async () => {
    const { deps } = makeDeps({
      authFiles: { [AUTH_PATH]: [authFile(EXPIRED_ENTRY)] },
      responses: [],
      onRefresh: () => ({ ran: false, detail: "spawn grok ENOENT" }),
    });
    const result = await transcribeXaiVoice(INPUT, deps);
    expect(result).toMatchObject({ ok: false, code: "auth_required" });
    expect((result as { message: string }).message).toContain("grok");
  });

  it("fails with auth_required when the CLI ran but the store stayed expired", async () => {
    const { deps, refreshCallCount } = makeDeps({
      authFiles: { [AUTH_PATH]: [authFile(EXPIRED_ENTRY)] },
      responses: [],
    });
    const result = await transcribeXaiVoice(INPUT, deps);
    expect(result).toMatchObject({ ok: false, code: "auth_required" });
    expect(refreshCallCount()).toBe(1);
  });

  it("returns retryable timeout when the budget is too small to refresh", async () => {
    const { deps, refreshCallCount } = makeDeps({
      authFiles: { [AUTH_PATH]: [authFile(EXPIRED_ENTRY)] },
      responses: [],
    });
    const result = await transcribeXaiVoice({ ...INPUT, timeoutMs: 100 }, deps);
    expect(result).toMatchObject({ ok: false, code: "timeout" });
    expect(refreshCallCount()).toBe(0);
  });

  it("returns retryable timeout when the refresh outlives the budget, without killing it", async () => {
    let refreshSettled = false;
    const { deps } = makeDeps({
      authFiles: { [AUTH_PATH]: [authFile(EXPIRED_ENTRY)] },
      responses: [],
      onRefresh: () =>
        new Promise<GrokRefreshOutcome>((resolve) => {
          setTimeout(() => {
            refreshSettled = true;
            resolve({ ran: true });
          }, 5_000);
        }),
    });
    const result = await transcribeXaiVoice({ ...INPUT, timeoutMs: 300 }, deps);
    expect(result).toMatchObject({ ok: false, code: "timeout" });
    expect(refreshSettled).toBe(false); // abandoned, not cancelled
  });

  it("retries a 401 with the best other unexpired scope, without spawning the CLI", async () => {
    // Two valid self-consistent scopes; the first pick 401s (wrong scope),
    // and the retry must use the other entry with NO delegated refresh —
    // try_ensure_fresh_auth would fast-path a locally-valid token anyway,
    // and the sessions command's own remote 401 recovery is cancellable.
    const otherIssuer = "https://auth.other.x.ai";
    const otherScope = `${otherIssuer}::other-client`;
    const twoScopes = JSON.stringify({
      [SCOPE]: VALID_ENTRY,
      [otherScope]: {
        ...VALID_ENTRY,
        key: "other-scope-key",
        oidc_issuer: otherIssuer,
        oidc_client_id: "other-client",
      },
    });
    const { deps, requests, refreshCallCount } = makeDeps({
      authFiles: { [AUTH_PATH]: [twoScopes] },
      responses: [
        () => json(401, { error: "wrong scope" }),
        () => json(200, { text: "other scope" }),
      ],
    });
    const result = await transcribeXaiVoice(INPUT, deps);
    expect(result).toMatchObject({ ok: true, text: "other scope" });
    expect(requests[0]!.headers.authorization).toBe("Bearer session-bearer");
    expect(requests[1]!.headers.authorization).toBe("Bearer other-scope-key");
    expect(refreshCallCount()).toBe(0);
  });

  it("maps a 401 with no alternative scope to auth_required without any refresh", async () => {
    const { deps, requests, refreshCallCount } = makeDeps({
      authFiles: { [AUTH_PATH]: [authFile(VALID_ENTRY)] },
      responses: [() => json(401, { error: "nope" })],
    });
    const result = await transcribeXaiVoice(INPUT, deps);
    expect(result).toMatchObject({ ok: false, code: "auth_required" });
    expect(requests).toHaveLength(1);
    expect(refreshCallCount()).toBe(0);
  });

  it("does not spend a refresh on a 403", async () => {
    const { deps, requests, refreshCallCount } = makeDeps({
      authFiles: { [AUTH_PATH]: [authFile(VALID_ENTRY)] },
      responses: [() => json(403, { error: "no stt entitlement" })],
    });
    const result = await transcribeXaiVoice(INPUT, deps);
    expect(result).toMatchObject({ ok: false, code: "auth_required" });
    expect(requests).toHaveLength(1);
    expect(refreshCallCount()).toBe(0);
  });

  it("does not retry a 401 on an API key", async () => {
    const { deps, requests, refreshCallCount } = makeDeps({
      env: { XAI_API_KEY: "sk-bad" },
      responses: [() => json(401, { error: "bad key" })],
    });
    const result = await transcribeXaiVoice(INPUT, deps);
    expect(result).toMatchObject({ ok: false, code: "auth_required" });
    expect(requests).toHaveLength(1);
    expect(refreshCallCount()).toBe(0);
  });

  it("prefers the self-consistent unexpired scope in a multi-scope store", async () => {
    const store = JSON.stringify({
      "https://old-issuer::stale-client": {
        key: "stale-key",
        expires_at: new Date(NOW - 1000).toISOString(),
      },
      [SCOPE]: VALID_ENTRY,
    });
    const { deps, requests } = makeDeps({
      authFiles: { [AUTH_PATH]: [store] },
      responses: [() => json(200, { text: "right scope" })],
    });
    const result = await transcribeXaiVoice(INPUT, deps);
    expect(result).toMatchObject({ ok: true, text: "right scope" });
    expect(requests[0]!.headers.authorization).toBe("Bearer session-bearer");
  });

  it("fails with auth_required when no credentials exist at all", async () => {
    const { deps } = makeDeps({ responses: [] });
    const result = await transcribeXaiVoice(INPUT, deps);
    expect(result).toMatchObject({ ok: false, code: "auth_required" });
  });

  it("maps 429 to rate_limited and 5xx to service_unavailable", async () => {
    for (const [status, code] of [
      [429, "rate_limited"],
      [503, "service_unavailable"],
    ] as const) {
      const { deps } = makeDeps({
        env: { XAI_API_KEY: "sk" },
        responses: [() => json(status, {})],
      });
      expect(await transcribeXaiVoice(INPUT, deps)).toMatchObject({
        ok: false,
        code,
      });
    }
  });

  it("maps unparseable and shapeless success bodies to invalid_response", async () => {
    for (const body of ["not json", "null", JSON.stringify({ nope: 1 })]) {
      const { deps } = makeDeps({
        env: { XAI_API_KEY: "sk" },
        responses: [() => new Response(body, { status: 200 })],
      });
      expect(await transcribeXaiVoice(INPUT, deps)).toMatchObject({
        ok: false,
        code: "invalid_response",
      });
    }
  });

  it("maps an abort while reading any body — success or error — to timeout", async () => {
    const abortingResponse = (status: number) => {
      const response = new Response("{}", { status });
      Object.defineProperty(response, "text", {
        value: async () => {
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        },
      });
      return response;
    };
    for (const status of [200, 400]) {
      const { deps } = makeDeps({
        env: { XAI_API_KEY: "sk" },
        responses: [() => abortingResponse(status)],
      });
      expect(await transcribeXaiVoice(INPUT, deps)).toMatchObject({
        ok: false,
        code: "timeout",
      });
    }
  });

  it("returns an empty transcription as success", async () => {
    const { deps } = makeDeps({
      env: { XAI_API_KEY: "sk" },
      responses: [() => json(200, { text: "" })],
    });
    expect(await transcribeXaiVoice(INPUT, deps)).toEqual({
      ok: true,
      model: "grok-stt",
      text: "",
    });
  });

  it("rejects an empty audio payload without calling xAI", async () => {
    const { deps, requests } = makeDeps({
      env: { XAI_API_KEY: "sk" },
      responses: [],
    });
    const result = await transcribeXaiVoice(
      { ...INPUT, audioBase64: "!!!" },
      deps,
    );
    expect(result).toMatchObject({ ok: false, code: "request_failed" });
    expect(requests).toHaveLength(0);
  });

  it("maps a fetch timeout to the timeout code", async () => {
    const { deps } = makeDeps({
      env: { XAI_API_KEY: "sk" },
      responses: [
        () => {
          throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
        },
      ],
    });
    expect(await transcribeXaiVoice(INPUT, deps)).toMatchObject({
      ok: false,
      code: "timeout",
    });
  });

  it("honors an XAI_STT_URL override", async () => {
    const { deps, requests } = makeDeps({
      env: { XAI_API_KEY: "sk", XAI_STT_URL: "https://proxy.internal/v1/stt" },
      responses: [() => json(200, { text: "proxied" })],
    });
    await transcribeXaiVoice(INPUT, deps);
    expect(requests[0]!.url).toBe("https://proxy.internal/v1/stt");
  });

  it("coalesces concurrent refreshes into one CLI spawn", async () => {
    let refreshCount = 0;
    let releaseRefresh: (() => void) | undefined;
    const { deps } = makeDeps({
      authFiles: {
        [AUTH_PATH]: [
          authFile(EXPIRED_ENTRY),
          authFile(EXPIRED_ENTRY),
          authFile({ ...VALID_ENTRY, key: "shared-refresh" }),
          authFile({ ...VALID_ENTRY, key: "shared-refresh" }),
        ],
      },
      responses: [
        () => json(200, { text: "a" }),
        () => json(200, { text: "b" }),
      ],
      onRefresh: () => {
        refreshCount += 1;
        return new Promise<GrokRefreshOutcome>((resolve) => {
          releaseRefresh = () => resolve({ ran: true });
        });
      },
    });
    const both = Promise.all([
      transcribeXaiVoice(INPUT, deps),
      transcribeXaiVoice(INPUT, deps),
    ]);
    await new Promise((r) => setTimeout(r, 20));
    releaseRefresh!();
    const results = await both;
    expect(results.every((r) => r.ok)).toBe(true);
    expect(refreshCount).toBe(1);
  });

  it("lets a short-budget caller time out while a joined long-budget caller succeeds", async () => {
    let releaseRefresh: (() => void) | undefined;
    const { deps } = makeDeps({
      authFiles: {
        [AUTH_PATH]: [
          authFile(EXPIRED_ENTRY),
          authFile(EXPIRED_ENTRY),
          authFile({ ...VALID_ENTRY, key: "late-refresh" }),
        ],
      },
      responses: [() => json(200, { text: "long caller wins" })],
      onRefresh: () =>
        new Promise<GrokRefreshOutcome>((resolve) => {
          releaseRefresh = () => resolve({ ran: true });
        }),
    });
    const short = transcribeXaiVoice({ ...INPUT, timeoutMs: 300 }, deps);
    const long = transcribeXaiVoice({ ...INPUT, timeoutMs: 10_000 }, deps);
    const shortResult = await short; // expires at ~300ms; refresh still held
    expect(shortResult).toMatchObject({ ok: false, code: "timeout" });
    releaseRefresh!();
    const longResult = await long;
    expect(longResult).toMatchObject({ ok: true, text: "long caller wins" });
  });
});
