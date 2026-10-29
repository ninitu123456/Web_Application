function id(value) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('Claim ID cannot be represented safely in the API');
  return result;
}

export function claimDto(claim) {
  const result = {
    id: id(claim.claim_id), claimantId: id(claim.claimant_id), itemId: id(claim.item_id),
    proofDescription: claim.proof_description, status: claim.status,
    submittedAt: claim.submitted_at instanceof Date ? claim.submitted_at.toISOString() : claim.submitted_at,
    reviewedAt: claim.reviewed_at instanceof Date ? claim.reviewed_at.toISOString() : claim.reviewed_at ?? null,
    completedAt: claim.completed_at instanceof Date ? claim.completed_at.toISOString() : claim.completed_at ?? null
  };
  if (claim.item_title !== undefined) result.item = {
    id: id(claim.item_id), title: claim.item_title, type: claim.item_type, status: claim.item_status,
    eventDate: claim.item_event_date instanceof Date ? claim.item_event_date.toISOString().slice(0, 10) : String(claim.item_event_date).slice(0, 10),
    category: claim.category_name ?? null, location: claim.location_name ?? null
  };
  if (claim.claimant_name !== undefined) result.claimant = { id: id(claim.claimant_id), fullName: claim.claimant_name };
  return result;
}
