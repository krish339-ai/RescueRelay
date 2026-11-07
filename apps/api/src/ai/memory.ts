import { z } from "zod";
import { assert } from "../errors.js";
import { scopeHash } from "./adapters.js";
import { AiHttp, jsonRequest } from "./http.js";
const headers = (http: AiHttp) => ({
  Authorization: `Token ${http.settings.vendors.mem0.key}`,
});
export async function savePreference(
  http: AiHttp,
  orgId: string,
  actorId: string,
  preferenceType: string,
  value: string,
): Promise<{ id: string; text: string }[]> {
  const userId = scopeHash(orgId, actorId);
  const content = `RescueRelay noncritical ${preferenceType} preference: ${value}. Advisory display preference only; never a safety, availability, capacity or food-handling rule.`;
  const response = await http.json(
    "mem0",
    "https://api.mem0.ai/v3/memories/add/",
    jsonRequest(
      {
        messages: [{ role: "user", content }],
        user_id: userId,
        infer: false,
        metadata: {
          rescuerelay_scope: userId,
          preference_type: preferenceType,
        },
      },
      headers(http),
    ),
  );
  const parsed = z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        memory: z.string().optional(),
        data: z.object({ memory: z.string().optional() }).optional(),
        user_id: z.string().optional(),
      }),
    )
    .max(10)
    .safeParse(response.results);
  assert(
    parsed.success && parsed.data.length > 0,
    502,
    "EXTERNAL_RESPONSE_INVALID",
    "Preference storage did not return synchronous memory IDs. No polling or inferred-memory mode was used.",
  );
  assert(
    parsed.data.every((r) => !r.user_id || r.user_id === userId),
    502,
    "REMOTE_SCOPE_MISMATCH",
    "Preference response contained an unexpected actor scope.",
  );
  return parsed.data.map((r) => ({
    id: r.id,
    text: r.memory ?? r.data?.memory ?? content,
  }));
}
export async function recallPreferences(
  http: AiHttp,
  orgId: string,
  actorId: string,
  query: string,
  ownedIds: Set<string>,
): Promise<{ id: string; text: string }[]> {
  const userId = scopeHash(orgId, actorId);
  const response = await http.json(
    "mem0",
    "https://api.mem0.ai/v3/memories/search/",
    jsonRequest(
      { query, filters: { user_id: userId }, top_k: 3 },
      headers(http),
    ),
    true,
  );
  const parsed = z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        memory: z.string().max(3000),
        user_id: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .max(20)
    .safeParse(response.results);
  assert(
    parsed.success,
    502,
    "EXTERNAL_RESPONSE_INVALID",
    "Preference search response was invalid.",
  );
  return parsed.data
    .filter(
      (r) =>
        ownedIds.has(r.id) &&
        (!r.user_id || r.user_id === userId) &&
        (!r.metadata?.rescuerelay_scope ||
          r.metadata.rescuerelay_scope === userId),
    )
    .map((r) => ({ id: r.id, text: r.memory }));
}
export async function forgetPreference(
  http: AiHttp,
  orgId: string,
  actorId: string,
  memoryId: string,
): Promise<void> {
  const owner = scopeHash(orgId, actorId),
    url = `https://api.mem0.ai/v1/memories/${encodeURIComponent(memoryId)}/`;
  const record = await http.json("mem0", url, { headers: headers(http) }, true);
  assert(
    record.id === memoryId && record.user_id === owner,
    403,
    "REMOTE_SCOPE_MISMATCH",
    "Remote memory ownership could not be verified; deletion was not attempted.",
  );
  await http.json("mem0", url, { method: "DELETE", headers: headers(http) });
}
