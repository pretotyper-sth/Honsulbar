export function entryRequirement(member) {
  if (member?.adult !== true) return 'adult';
  if (!member?.photo || !member?.gender) return 'profile';
  if (member.photoChecked !== true) return 'photo';
  return null;
}
