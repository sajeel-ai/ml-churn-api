export class ApiError extends Error {
  status: number;
  fieldErrors: { field: string; message: string }[];
  retryAfter?: number;
  constructor(status: number, message: string, fieldErrors: { field: string; message: string }[] = []) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const CSRF_COOKIE = "churn_csrf";

export function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
  return m ? decodeURIComponent(m.split("=")[1]) : undefined;
}

type Detail = string | { loc?: (string | number)[]; msg: string }[] | undefined;

export function parseDetail(detail: Detail, fallback: string) {
  if (typeof detail === "string") return { message: detail, fields: [] };
  if (Array.isArray(detail) && detail.length) {
    const fields = detail.map((d) => ({
      field: (d.loc ?? []).filter((x) => x !== "body").join("."),
      message: d.msg.replace(/^Value error, /, ""),
    }));
    return { message: fields.map((f) => f.message).join(" "), fields };
  }
  return { message: fallback, fields: [] };
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  json?: unknown;
  form?: FormData;
  signal?: AbortSignal;
  /** return the raw Response (for downloads) */
  raw?: boolean;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const method = opts.method ?? (opts.json !== undefined || opts.form ? "POST" : "GET");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") {
    const token = readCookie(CSRF_COOKIE);
    if (token) headers["X-CSRF-Token"] = token;
  }
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) body = opts.form;

  let res: Response;
  try {
    res = await fetch(path, { method, headers, body, credentials: "same-origin", signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Cannot reach the server. Check your connection and try again.");
  }

  if (!res.ok) {
    let data: { detail?: Detail } = {};
    try { data = await res.json(); } catch { /* non-JSON error body */ }
    const generic = res.status >= 500 ? "Something went wrong on our side. Please try again." : "Request failed.";
    const { message, fields } = parseDetail(data.detail, generic);
    const err = new ApiError(res.status, message, fields);
    const ra = res.headers.get("Retry-After");
    if (ra) err.retryAfter = Number(ra);
    throw err;
  }
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function download(path: string, fallbackName: string) {
  const res = await api<Response>(path, { raw: true });
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export const qs = (params: Record<string, string | number | string[] | undefined | null>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
};
