import type { Donation, User } from "@rescuerelay/shared";
import { assert } from "./errors.js";
import { audit, id, nowIso, type OrgState } from "./state.js";
/** Shared validated domain boundary for manual and human-reviewed AI donation creation. */
export function addDonation(
  state: OrgState,
  user: User,
  fields: Omit<Donation, "id" | "createdAt">,
): Donation {
  assert(
    fields.category === "shelf_stable" && fields.sealed,
    422,
    "UNSUPPORTED_HANDLING",
    "This workflow accepts only sealed shelf-stable goods. Escalate other handling needs outside this workflow.",
  );
  assert(
    state.donors.some((d) => d.id === fields.donorId),
    422,
    "INVALID_DONOR",
    "Donor must belong to your organization.",
  );
  const donation = { ...fields, id: id("d"), createdAt: nowIso() };
  state.donations.push(donation);
  audit(state, user, "donation.created", donation.id, donation.description);
  return donation;
}
