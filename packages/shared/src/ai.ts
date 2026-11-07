/** Optional external AI integrations. "Configured" never means connected or live-tested. */
import type {
  Citation,
  Donation,
  Policy,
  RecoveryPlan,
  Snapshot,
} from "./index";
export type AiProviderId =
  | "fireworks"
  | "nebius"
  | "openai"
  | "pinecone"
  | "tavily"
  | "keenable"
  | "mem0"
  | "langsmith"
  | "llamaparse"
  | "elevenlabs";
export type AiOperation =
  | "investigate"
  | "policy_search"
  | "policy_index"
  | "source_discovery"
  | "preference_recall"
  | "preference_save"
  | "preference_forget"
  | "document_upload"
  | "document_poll"
  | "voice_transcribe";
export type AiOperationInput =
  | {
      operation: "investigate";
      input: {
        provider: "fireworks" | "nebius" | "openai";
        rescueIds?: string[];
        usePinecone?: boolean;
        trace?: boolean;
      };
    }
  | { operation: "policy_index"; input: { referenceIds: string[] } }
  | { operation: "policy_search"; input: { query: string } }
  | {
      operation: "source_discovery";
      input: {
        query: string;
        domains: string[];
        provider?: "tavily" | "keenable";
      };
    }
  | { operation: "preference_recall"; input: { query: string } }
  | {
      operation: "preference_save";
      input: {
        preferenceType: "communication_style" | "ui_density";
        value: "concise" | "detailed" | "comfortable" | "compact";
      };
    }
  | { operation: "preference_forget"; input: { memoryId: string } }
  | {
      operation: "document_upload";
      input: {
        filename: string;
        mimeType: "application/pdf" | "text/plain";
        contentBase64: string;
        title: string;
      };
    }
  | { operation: "document_poll"; input: { draftId: string } }
  | {
      operation: "voice_transcribe";
      input: {
        filename: string;
        mimeType: "audio/mpeg" | "audio/wav" | "audio/mp4" | "audio/webm";
        contentBase64: string;
        title: string;
      };
    };
export interface AiCapability {
  provider: AiProviderId;
  label: string;
  enabled: boolean;
  configured: boolean;
  available: boolean;
  liveTested: false;
  requiredEnv: string[];
  missingEnv: string[];
  operations: AiOperation[];
  note: string;
}
export interface AiCapabilities {
  externalCallsEnabled: boolean;
  providers: AiCapability[];
  allowedResearchDomains: string[];
  maximumFileBytes: number;
  consentTtlSeconds: number;
  localFallbackAvailable: true;
  disclosure: string;
}
export interface AiConsentManifest {
  consentId: string;
  operation: AiOperation;
  expiresAt: string;
  expectedVersion: number;
  payloadSha256: string;
  providers: AiProviderId[];
  dataCategories: string[];
  payloadPreview: Record<string, unknown>;
  maximumRequests: number;
  retentionNotice: string;
  requiresExplicitConfirmation: true;
  executionMode: "external" | "local-only";
  executionAvailable: boolean;
}
export interface AiSource {
  title: string;
  url: string;
  excerpt: string;
  sourceId?: string;
  version?: string;
  namespace?: string;
}
export interface AiDraft {
  id: string;
  kind: "reference_policy" | "rescue_note";
  status: "processing" | "needs_review" | "approved" | "rejected" | "failed";
  provider: AiProviderId;
  title: string;
  content: string;
  sources: AiSource[];
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  approvedEntityId?: string;
  notice: string;
}
export interface AiMemory {
  id: string;
  preferenceType: string;
  value: string;
  createdAt: string;
}
export interface AiOperationReceipt {
  id: string;
  operation: AiOperation;
  status:
    | "completed"
    | "external_completed_local_stale"
    | "partial_external_write"
    | "outcome_unknown"
    | "rejected";
  providers: AiProviderId[];
  requestCount: number;
  payloadSha256: string;
  createdAt: string;
  externalRecords: { provider: AiProviderId; kind: string; id: string }[];
  guidance: string;
}
export interface AiWorkspace {
  receipts?: AiOperationReceipt[];
  drafts: AiDraft[];
  referencePolicies: Policy[];
  memories: AiMemory[];
}
export interface AiOperationResponse {
  receipt?: AiOperationReceipt;
  snapshot: Snapshot;
  summary: string;
  warnings: string[];
  drafts?: AiDraft[];
  citations?: Citation[];
  sources?: AiSource[];
  preferences?: { id: string; text: string }[];
  plan?: RecoveryPlan;
  fallback?: "local-only";
}
export interface AiDraftApproval {
  expectedVersion: number;
  referencePolicy?: { title: string; text: string; scope: Policy["scope"] };
  donation?: Omit<Donation, "id" | "createdAt">;
}
