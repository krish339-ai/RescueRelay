import type {
  AiDraft,
  AiMemory,
  AiOperationReceipt,
  Policy,
} from "@rescuerelay/shared";
import type { OrgState } from "../state.js";
export interface StoredAiDraft extends AiDraft {
  remoteJobId?: string;
  ownerId: string;
}
export interface StoredAiMemory extends AiMemory {
  ownerId: string;
  remoteId: string;
}
export interface StoredAiReceipt extends AiOperationReceipt {
  ownerId: string;
}
export interface AiState {
  receipts: StoredAiReceipt[];
  drafts: StoredAiDraft[];
  referencePolicies: Policy[];
  memories: StoredAiMemory[];
}
export function aiState(s: OrgState): AiState {
  const state =
    s.ai ??
    (s.ai = { drafts: [], referencePolicies: [], memories: [], receipts: [] });
  state.receipts ??= [];
  return state;
}
export function publicDraft(d: StoredAiDraft): AiDraft {
  const { remoteJobId, ownerId, ...safe } = d;
  return safe;
}
