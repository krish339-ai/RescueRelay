import type {
  AiCapabilities,
  AiCapability,
  AiProviderId,
} from "@rescuerelay/shared";
export interface VendorSettings {
  enabled: boolean;
  key?: string;
  model?: string;
  host?: string;
  project?: string;
  tier?: string;
  version?: string;
  tenantId?: string;
}
export interface AiSettings {
  externalCallsEnabled: boolean;
  vendors: Record<AiProviderId, VendorSettings>;
  allowedResearchDomains: string[];
}
const definitions: Record<
  AiProviderId,
  {
    label: string;
    env: string[];
    operations: AiCapability["operations"];
    note: string;
  }
> = {
  fireworks: {
    label: "Fireworks AI",
    env: ["FIREWORKS_API_KEY", "FIREWORKS_MODEL"],
    operations: ["investigate"],
    note: "Chat Completions read-only tool investigation; explicit model required.",
  },
  nebius: {
    label: "Nebius Token Factory",
    env: ["NEBIUS_API_KEY", "NEBIUS_MODEL"],
    operations: ["investigate"],
    note: "Chat Completions read-only tools; model capabilities must be checked by the operator.",
  },
  openai: {
    label: "OpenAI API",
    env: ["OPENAI_API_KEY", "OPENAI_MODEL"],
    operations: ["investigate"],
    note: "Separate API access; any subscription-linked promotional credits are unverified here.",
  },
  pinecone: {
    label: "Pinecone",
    env: ["PINECONE_API_KEY", "PINECONE_INDEX_HOST"],
    operations: ["policy_search", "policy_index", "investigate"],
    note: "Documents API 2026-07 only; an existing integrated-embedding document index is required. No index provisioning; approved reference indexing requires its own consent.",
  },
  tavily: {
    label: "Tavily",
    env: ["TAVILY_API_KEY"],
    operations: ["source_discovery"],
    note: "Basic, allowlisted-domain discovery; results become reviewable reference drafts, never safety rules.",
  },
  keenable: {
    label: "Keenable",
    env: ["KEENABLE_API_KEY"],
    operations: ["source_discovery"],
    note: "Explicit alternate search, one approved site per operation. Uses sourced snippets; never automatically falls back to Tavily.",
  },
  mem0: {
    label: "Mem0",
    env: ["MEM0_API_KEY"],
    operations: ["preference_save", "preference_recall", "preference_forget"],
    note: "Structured noncritical preferences scoped to the current actor and organization; never hard constraints.",
  },
  langsmith: {
    label: "LangSmith",
    env: ["LANGSMITH_API_KEY", "LANGSMITH_PROJECT"],
    operations: ["investigate"],
    note: "Separate opt-in redacted count/tool metadata only; a trace failure never fails the operation.",
  },
  llamaparse: {
    label: "LlamaIndex / LlamaParse",
    env: ["LLAMA_CLOUD_API_KEY", "LLAMAPARSE_TIER", "LLAMAPARSE_VERSION"],
    operations: ["document_upload", "document_poll"],
    note: "Async document parsing into reference drafts; uploaded content is sent to LlamaCloud. PAYG/retention terms may apply.",
  },
  elevenlabs: {
    label: "ElevenLabs",
    env: ["ELEVENLABS_API_KEY", "ELEVENLABS_STT_MODEL"],
    operations: ["voice_transcribe"],
    note: "Uploaded audio to text to a reviewable rescue-note draft; no voice calling, recipient contact or safety certification.",
  },
};
const enabled = (env: NodeJS.ProcessEnv, name: string) => env[name] === "true";
export function loadAiSettings(
  env: NodeJS.ProcessEnv = process.env,
): AiSettings {
  return {
    externalCallsEnabled: enabled(env, "AI_EXTERNAL_CALLS_ENABLED"),
    allowedResearchDomains: (
      env.TAVILY_ALLOWED_DOMAINS ??
      "usda.gov,fda.gov,foodrescuehero.org,foodrescue.us"
    )
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
    vendors: {
      fireworks: {
        enabled: enabled(env, "FIREWORKS_ENABLED"),
        key: env.FIREWORKS_API_KEY,
        model: env.FIREWORKS_MODEL,
      },
      nebius: {
        enabled: enabled(env, "NEBIUS_ENABLED"),
        key: env.NEBIUS_API_KEY,
        model: env.NEBIUS_MODEL,
      },
      openai: {
        enabled: enabled(env, "OPENAI_ENABLED"),
        key: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL,
      },
      pinecone: {
        enabled: enabled(env, "PINECONE_ENABLED"),
        key: env.PINECONE_API_KEY,
        host: env.PINECONE_INDEX_HOST,
      },
      tavily: {
        enabled: enabled(env, "TAVILY_ENABLED"),
        key: env.TAVILY_API_KEY,
      },
      keenable: {
        enabled: enabled(env, "KEENABLE_ENABLED"),
        key: env.KEENABLE_API_KEY,
      },
      mem0: { enabled: enabled(env, "MEM0_ENABLED"), key: env.MEM0_API_KEY },
      langsmith: {
        enabled: enabled(env, "LANGSMITH_ENABLED"),
        key: env.LANGSMITH_API_KEY,
        project: env.LANGSMITH_PROJECT,
        tenantId: env.LANGSMITH_WORKSPACE_ID,
      },
      llamaparse: {
        enabled: enabled(env, "LLAMAPARSE_ENABLED"),
        key: env.LLAMA_CLOUD_API_KEY,
        tier: env.LLAMAPARSE_TIER,
        version: env.LLAMAPARSE_VERSION,
      },
      elevenlabs: {
        enabled: enabled(env, "ELEVENLABS_ENABLED"),
        key: env.ELEVENLABS_API_KEY,
        model: env.ELEVENLABS_STT_MODEL,
      },
    },
  };
}
export function capabilities(settings: AiSettings): AiCapabilities {
  const fieldValues = (id: AiProviderId) => {
    const s = settings.vendors[id];
    switch (id) {
      case "fireworks":
      case "nebius":
      case "openai":
      case "elevenlabs":
        return [s.key, s.model];
      case "pinecone":
        return [s.key, s.host];
      case "langsmith":
        return [s.key, s.project];
      case "llamaparse":
        return [s.key, s.tier, s.version];
      default:
        return [s.key];
    }
  };
  return {
    externalCallsEnabled: settings.externalCallsEnabled,
    providers: (
      Object.entries(definitions) as [
        AiProviderId,
        (typeof definitions)[AiProviderId],
      ][]
    ).map(([provider, d]) => {
      const values = fieldValues(provider),
        missingEnv = d.env.filter((_, i) => !values[i]);
      return {
        provider,
        ...d,
        enabled: settings.vendors[provider].enabled,
        configured: missingEnv.length === 0,
        available:
          settings.externalCallsEnabled &&
          settings.vendors[provider].enabled &&
          missingEnv.length === 0,
        liveTested: false,
        requiredEnv: [
          "AI_EXTERNAL_CALLS_ENABLED",
          `${provider.toUpperCase()}_ENABLED`,
          ...d.env,
        ],
        missingEnv,
      };
    }),
    allowedResearchDomains: settings.allowedResearchDomains,
    maximumFileBytes: 2 * 1024 * 1024,
    consentTtlSeconds: 300,
    localFallbackAvailable: true,
    disclosure:
      "Every adapter is OFF by default and mock-verified only. Configured means required settings are present, not that credentials, credits, model access or a connection were tested. No calls occur when opening this page.",
  };
}
