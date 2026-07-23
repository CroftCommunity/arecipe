// D15 Phase 8 — image license gate. Free-culture allowlist (owner decision):
// accept CC-BY, CC-BY-SA, CC0, Public Domain; skip non-commercial (NC),
// no-derivatives (ND), and unknown/unstated. Version-agnostic (CC BY-SA 2.5 and
// 3.0 both pass). Publishing a non-free image as free would be a rights error,
// so the default is to skip + record a reason.

export type LicenseVerdict = { accept: boolean; reason?: string };

/** Decide whether a Commons `extmetadata.LicenseShortName` is free-culture. */
export const acceptLicense = (shortName: string): LicenseVerdict => {
  const s = (shortName ?? '').trim();
  if (s === '') return { accept: false, reason: 'no license stated' };
  const norm = s.toLowerCase();

  // NC / ND disqualify regardless of the CC prefix.
  if (/\bnc\b|non[- ]?commercial/.test(norm)) return { accept: false, reason: `non-commercial: ${s}` };
  if (/\bnd\b|no[- ]?deriv/.test(norm)) return { accept: false, reason: `no-derivatives: ${s}` };

  if (/^cc0|creative commons zero/.test(norm)) return { accept: true };
  if (/public domain|\bpd\b|pd-/.test(norm)) return { accept: true };
  // CC BY or CC BY-SA, any version.
  if (/cc[ -]?by([ -]?sa)?\b/.test(norm)) return { accept: true };

  return { accept: false, reason: `not free-culture: ${s}` };
};
