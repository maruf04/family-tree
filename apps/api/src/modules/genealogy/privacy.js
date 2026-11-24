// Privacy rules for person records. Living people are private by default
// (effective_privacy = 'restricted'); see docs/database.md.

/** Can this viewer see a person's personal details (dates, places, photo, biography)? */
export function canSeeDetails(viewer, person) {
  if (!viewer) return person.effective_privacy === 'public';
  if (viewer.isModerator || (viewer.personId && viewer.personId === person.id)) return true;
  switch (person.effective_privacy) {
    case 'public':
      return true;
    case 'members':
      return viewer.verified;
    case 'family':
      return viewer.verified && (person.family_ids ?? []).some((id) => viewer.familyIds.includes(id));
    default:
      return false;
  }
}

const DETAIL_FIELDS = [
  'birth', 'death', 'nickname_bn', 'nickname_en', 'birth_place_bn', 'birth_place_en',
  'death_place_bn', 'death_place_en', 'burial_place_bn', 'burial_place_en',
  'occupation_bn', 'occupation_en', 'biography_bn', 'biography_en', 'photo_id',
];

/**
 * Shape a person row for a viewer. Names and tree position stay visible to
 * verified members so trees remain navigable; details are blanked when hidden.
 */
export function presentPerson(row, viewer) {
  if (!row) return row;
  const { family_ids: _familyIds, research_notes: researchNotes, ...out } = row;
  const visible = canSeeDetails(viewer, row);
  out.redacted = !visible;
  if (!visible) {
    for (const field of DETAIL_FIELDS) if (field in out) out[field] = null;
  }
  if (viewer?.isModerator && researchNotes !== undefined) out.research_notes = researchNotes;
  return out;
}
