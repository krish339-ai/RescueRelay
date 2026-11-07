import type { OrgState } from "../state.js";
import { assert } from "../errors.js";
import { aiState } from "./state.js";
import { AiHttp, jsonRequest } from "./http.js";
import { pineconeOrigin, scopeHash } from "./adapters.js";
export function indexDocuments(state: OrgState, referenceIds: string[]) {
  assert(
    referenceIds.length > 0 &&
      referenceIds.length <= 5 &&
      new Set(referenceIds).size === referenceIds.length,
    400,
    "INDEX_BATCH_LIMIT",
    "Select one to five distinct approved reference policies.",
  );
  const references = referenceIds.map((id) =>
    aiState(state).referencePolicies.find((p) => p.id === id),
  );
  assert(
    references.every(Boolean),
    404,
    "REFERENCE_NOT_FOUND",
    "Only approved reference knowledge in this organization may be indexed.",
  );
  const documents = references.flatMap((p) => {
    const ref = p!;
    const draft = aiState(state).drafts.find(
      (d) => d.approvedEntityId === ref.id,
    );
    const sourceUrl = draft?.sources.find((s) =>
      s.url.startsWith("https://"),
    )?.url;
    const chars = Array.from(ref.text),
      chunks: string[] = [];
    for (let i = 0; i < chars.length; i += 2000)
      chunks.push(chars.slice(i, i + 2000).join(""));
    return chunks.map((chunk_text, i) => ({
      _id: `${ref.id}:chunk:${i}`,
      chunk_text,
      source_id: ref.id,
      source_ref: ref.id,
      ...(sourceUrl ? { source_url: sourceUrl } : {}),
      title: ref.title,
      version: ref.version,
      reference_only: true,
    }));
  });
  assert(
    documents.length <= 40 &&
      Buffer.byteLength(JSON.stringify({ documents })) <= 64000,
    422,
    "INDEX_BATCH_LIMIT",
    "The reviewed index batch exceeds 40 chunks or 64 KiB. Select fewer reference policies. Byte limits are not credit or spending caps.",
  );
  return documents;
}
export async function indexReferences(
  http: AiHttp,
  state: OrgState,
  ids: string[],
  record: (id: string) => void,
) {
  const documents = indexDocuments(state, ids),
    v = http.settings.vendors.pinecone;
  const origin = pineconeOrigin(v.host!);
  documents.forEach((d) => record(d._id));
  const namespace = scopeHash(state.organization.id);
  const result = await http.json(
    "pinecone",
    `${origin}/namespaces/${encodeURIComponent(namespace)}/documents/upsert`,
    jsonRequest(
      { documents },
      { "Api-Key": v.key!, "X-Pinecone-Api-Version": "2026-07" },
    ),
  );
  assert(
    Number.isInteger(result.upserted_count) &&
      result.upserted_count === documents.length,
    502,
    "INDEX_ACCEPTANCE_UNCERTAIN",
    "Pinecone did not confirm the expected accepted document count. Review the operation receipt before retrying; embedding retries may be billed again.",
  );
  return { count: documents.length, namespace };
}
