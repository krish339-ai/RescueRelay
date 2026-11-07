import type {
  AiCapability,
  AiConsentManifest,
  AiProviderId,
} from "@rescuerelay/shared";
export const MAX_AI_FILE_BYTES = 2 * 1024 * 1024;
export function capabilityLabel(
  capability: AiCapability,
  externalEnabled: boolean,
): string {
  if (!capability.enabled) return "Disabled";
  if (!capability.configured) return "Settings missing";
  if (!externalEnabled) return "External calls off";
  return capability.available ? "Available with consent" : "Execution blocked";
}
export function safeExternalUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function consentIsStale(
  manifest: AiConsentManifest,
  version: number,
  now = Date.now(),
): boolean {
  return (
    manifest.expectedVersion !== version ||
    Date.parse(manifest.expiresAt) <= now
  );
}
export async function encodeAiFile(
  file: File,
  maximumBytes = MAX_AI_FILE_BYTES,
): Promise<string> {
  if (file.size > Math.min(maximumBytes, MAX_AI_FILE_BYTES))
    throw new Error(
      "This file is too large. Choose a file no larger than 2 MiB.",
    );
  if (!file.size) throw new Error("Choose a non-empty file.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 16384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(binary);
}
export const providerLabels: Record<AiProviderId, string> = {
  fireworks: "Fireworks",
  nebius: "Nebius",
  openai: "OpenAI",
  pinecone: "Pinecone",
  tavily: "Tavily",
  keenable: "Keenable",
  mem0: "Mem0",
  langsmith: "LangSmith",
  llamaparse: "LlamaParse",
  elevenlabs: "ElevenLabs",
};

/** A late AI response must never replace another login's scoped workspace. */
export function mergeScopedAiSnapshot(
  activeToken: string | undefined,
  requestToken: string,
  current: import("@rescuerelay/shared").Snapshot | null,
  next: import("@rescuerelay/shared").Snapshot,
): import("@rescuerelay/shared").Snapshot | null {
  if (activeToken !== requestToken) return current;
  if (
    current &&
    (current.organization.id !== next.organization.id ||
      current.user.id !== next.user.id ||
      next.version < current.version)
  )
    return current;
  return next;
}

export function sourceDiscoveryRequest(
  provider: "tavily" | "keenable",
  query: string,
  domains: string[],
  allowedDomains: string[],
): import("@rescuerelay/shared").AiOperationInput {
  if (provider !== "tavily" && provider !== "keenable")
    throw new Error("Choose a supported source-discovery provider.");
  if (
    !domains.length ||
    domains.length > 6 ||
    new Set(domains).size !== domains.length ||
    !domains.every((domain) => allowedDomains.includes(domain))
  )
    throw new Error(
      "Select one to six distinct operator-approved research domains.",
    );
  if (provider === "keenable" && domains.length !== 1)
    throw new Error(
      "Keenable requires exactly one approved source domain per request.",
    );
  return { operation: "source_discovery", input: { provider, query, domains } };
}
export function policyIndexRequest(
  referenceIds: string[],
  approvedReferenceIds: string[],
): import("@rescuerelay/shared").AiOperationInput {
  if (
    !referenceIds.length ||
    referenceIds.length > 5 ||
    new Set(referenceIds).size !== referenceIds.length ||
    !referenceIds.every((id) => approvedReferenceIds.includes(id))
  )
    throw new Error(
      "Select one to five distinct human-approved references. Configured hard policies cannot be indexed here.",
    );
  return { operation: "policy_index", input: { referenceIds } };
}
