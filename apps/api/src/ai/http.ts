import type { AiProviderId } from "@rescuerelay/shared";
import { assert, AppError, fail } from "../errors.js";
import { capabilities, type AiSettings } from "./config.js";
export type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
/** One-operation bounded transport. No logging of bodies, headers, keys or vendor error text. */
export class AiHttp {
  calls = 0;
  constructor(
    readonly settings: AiSettings,
    private fetcher: Fetcher = fetch,
    readonly maximumCalls = 12,
    private timeoutMs = 12000,
    private pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  ) {}
  available(provider: AiProviderId) {
    return capabilities(this.settings).providers.find(
      (p) => p.provider === provider,
    )!.available;
  }
  assertEnabled(provider: AiProviderId) {
    assert(
      this.settings.externalCallsEnabled,
      403,
      "EXTERNAL_CALLS_DISABLED",
      "External AI calls are disabled by the operator.",
    );
    const c = capabilities(this.settings).providers.find(
      (p) => p.provider === provider,
    )!;
    assert(c.enabled, 403, "ADAPTER_DISABLED", `${c.label} is disabled.`);
    assert(
      c.configured,
      503,
      "ADAPTER_NOT_CONFIGURED",
      `${c.label} requires server-side settings. No key can be supplied in this request.`,
    );
  }
  async json(
    provider: AiProviderId,
    url: string,
    init: RequestInit = {},
    retry429 = false,
  ): Promise<any> {
    this.assertEnabled(provider);
    for (let attempt = 0; attempt < 2; attempt++) {
      assert(
        this.calls < this.maximumCalls,
        422,
        "EXTERNAL_CALL_BUDGET",
        "The operation reached its external request budget. No automatic continuation is allowed.",
      );
      this.calls++;
      let response: Response;
      try {
        response = await this.fetcher(url, {
          ...init,
          redirect: "error",
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch {
        fail(
          502,
          "EXTERNAL_OUTCOME_UNKNOWN",
          "The external request failed or timed out. Its outcome may be unknown; review vendor activity before explicitly retrying.",
        );
      }
      if (response!.status === 429 && retry429 && attempt === 0) {
        try {
          await response!.body?.cancel();
        } catch {
          /* Discard failures never expose vendor text. */
        }
        const seconds = Number(response!.headers.get("retry-after") ?? 0);
        await this.pause(
          Math.min(
            1000,
            Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : 0),
          ),
        );
        continue;
      }
      if (!response!.ok) {
        try {
          await response!.body?.cancel();
        } catch {
          /* Discard failures never expose vendor text. */
        }
        throw new AppError(
          response!.status === 429 ? 429 : 502,
          "EXTERNAL_PROVIDER_ERROR",
          `External ${provider} request returned HTTP ${response!.status}. No provider switch or automatic write retry occurred.`,
          { provider, status: response!.status },
        );
      }
      if (response!.status === 204) return {};
      let text = "",
        bytes = 0;
      try {
        const reader = response!.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.length;
            if (bytes > 2 * 1024 * 1024) {
              try {
                await reader.cancel();
              } catch {}
              fail(
                502,
                "EXTERNAL_RESPONSE_LIMIT",
                "External response exceeded the bounded response size.",
              );
            }
            text += decoder.decode(chunk.value, { stream: true });
          }
          text += decoder.decode();
        }
      } catch (error) {
        if (error instanceof AppError) throw error;
        fail(
          502,
          "EXTERNAL_OUTCOME_UNKNOWN",
          "The external response stream was interrupted. Its outcome may be unknown; review the receipt before authorizing another request.",
        );
      }
      try {
        return text ? JSON.parse(text) : {};
      } catch {
        fail(
          502,
          "EXTERNAL_RESPONSE_INVALID",
          "External provider returned an invalid JSON response.",
        );
      }
    }
    throw new AppError(
      429,
      "EXTERNAL_PROVIDER_ERROR",
      "External provider remains rate limited.",
    );
  }
}
export const jsonRequest = (
  body: unknown,
  headers: Record<string, string>,
): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});
