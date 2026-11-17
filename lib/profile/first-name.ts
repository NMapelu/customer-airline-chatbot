// A friendly first name from an email address, for greetings: "neema.mapelu@example.com" becomes
// "Neema". The part before the @ is split at dots, underscores, dashes, plus signs and digits, and
// the first piece with letters is capitalised. Returns null when there is nothing name-like, so
// the caller can fall back to a greeting without a name.
export function firstNameFromEmail(email: string | null | undefined): string | null {
  const local = (email ?? '').split('@')[0] ?? '';
  const piece = local.split(/[._\-+0-9]+/).find((p) => /\p{L}/u.test(p));
  if (!piece) return null;
  const name = piece.slice(0, 30).toLowerCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}
