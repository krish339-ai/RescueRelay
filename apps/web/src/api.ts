import type { ApiError } from "@rescuerelay/shared";
export const API_BASE = import.meta.env?.VITE_API_URL || "/api";
export class ApiFailure extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(status: number, data: ApiError) {
    super(
      (data.error || "Something went wrong. Please try again.") +
        (Array.isArray(data.details)
          ? " " +
            data.details
              .map(
                (d: { path?: string; message?: string }) =>
                  `${d.path || "Field"}: ${d.message || "Check this value."}`,
              )
              .join(" ")
          : ""),
    );
    this.code = data.code;
    this.status = status;
    this.details = data.details;
  }
}
export async function api<T>(
  path: string,
  token?: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(
      path === "/ai/operations"
        ? 190000
        : body &&
            typeof body === "object" &&
            "mode" in body &&
            body.mode === "provider"
          ? 120000
          : 30000,
    ),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiFailure(response.status, data);
  return data as T;
}
export async function downloadCsv(path: string, token: string, name: string) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const d = await response.json();
    throw new ApiFailure(response.status, d);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
