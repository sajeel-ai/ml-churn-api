import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, parseDetail, qs } from "../api";
import { safeNext } from "../utils";

/** Await a promise that is expected to reject with an ApiError. */
const failure = async (p: Promise<unknown>): Promise<ApiError> => {
  try { await p; } catch (e) { return e as ApiError; }
  throw new Error("expected the request to fail");
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("api client", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal("fetch", fetchMock); document.cookie = "churn_csrf=tok123; path=/"; });
  afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); document.cookie = "churn_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"; });

  it("sends the CSRF token on state-changing requests only", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(200, { ok: true })));
    await api("/api/v1/x", { json: { a: 1 } });
    expect(fetchMock.mock.calls[0][1].headers["X-CSRF-Token"]).toBe("tok123");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    await api("/api/v1/x");
    expect(fetchMock.mock.calls[1][1].headers["X-CSRF-Token"]).toBeUndefined();
    expect(fetchMock.mock.calls[1][1].credentials).toBe("same-origin");
  });

  it("never sends the session via script-readable storage or Authorization headers", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(200, {})));
    await api("/api/v1/x", { method: "DELETE" });
    const h = fetchMock.mock.calls[0][1].headers;
    expect(h.Authorization).toBeUndefined();
  });

  it("parses FastAPI validation errors into field messages", async () => {
    fetchMock.mockResolvedValue(json(422, { detail: [{ loc: ["body", "tenure"], msg: "Input should be >= 0" }] }));
    const err = await failure(api("/api/v1/x", { json: {} }));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.fieldErrors).toEqual([{ field: "tenure", message: "Input should be >= 0" }]);
  });

  it("surfaces string details, Retry-After and generic 5xx text", async () => {
    fetchMock.mockResolvedValueOnce(json(429, { detail: "Too many attempts." }, { "Retry-After": "900" }));
    const e1 = await failure(api("/x"));
    expect(e1.message).toBe("Too many attempts.");
    expect(e1.retryAfter).toBe(900);
    fetchMock.mockResolvedValueOnce(new Response("<html>boom</html>", { status: 502 }));
    const e2 = await failure(api("/x"));
    expect(e2.message).toMatch(/something went wrong/i);
    expect(e2.message).not.toContain("boom");
  });

  it("reports network failures clearly", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const e = await failure(api("/x"));
    expect(e.status).toBe(0);
    expect(e.message).toMatch(/cannot reach the server/i);
  });

  it("returns undefined for 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await api("/x", { method: "DELETE" })).toBeUndefined();
  });
});

describe("helpers", () => {
  it("qs drops empty values and repeats arrays", () => {
    expect(qs({ q: "", page: 2, risk_level: ["high", "low"], x: undefined })).toBe("?page=2&risk_level=high&risk_level=low");
    expect(qs({})).toBe("");
  });
  it("parseDetail falls back", () => { expect(parseDetail(undefined, "fallback").message).toBe("fallback"); });
  it("safeNext only allows same-site paths (no open redirect)", () => {
    expect(safeNext("/predict")).toBe("/predict");
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
  });
});
