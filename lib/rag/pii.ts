// Masks text that looks like personal data before anything is sent to OpenAI (R7, overview §10.11).
// It is a safety net, not a guarantee: the chat also asks users not to share these details.

export type PiiKind = 'card' | 'passport' | 'phone' | 'booking_ref';
export type MaskResult = { text: string; found: PiiKind[] };

const LABELS: Record<PiiKind, string> = {
  card: '[card number removed]',
  passport: '[passport number removed]',
  phone: '[phone number removed]',
  booking_ref: '[booking reference removed]',
};

const CARD = /\b\d(?:[ -]?\d){12,18}\b/g;
const PASSPORT = /\b[A-Z]{1,2}\d{6,8}\b/g;
const PHONE = /(?:\+|\b)\d[\d ().-]{7,18}\d\b/g;
const LABELLED_BOOKING = /\b(booking ref(?:erence)?|reservation (?:code|number)|confirmation (?:code|number)|pnr)(\s*(?:is|:|#|-)?\s*)([a-z0-9]{6})\b/gi;
// Six letters and digits with at least one of each, like ABC12D. Flight numbers (KQ100, KQ1234) are kept.
const BOOKING = /\b(?=[A-Z0-9]{6}\b)(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6}\b/g;

const digitsOf = (s: string) => s.replace(/\D/g, '');

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function maskPii(input: string): MaskResult {
  const found = new Set<PiiKind>();
  const hit = (kind: PiiKind) => {
    found.add(kind);
    return LABELS[kind];
  };

  let text = input.replace(CARD, (m) => (luhn(digitsOf(m)) ? hit('card') : m));
  text = text.replace(PASSPORT, () => hit('passport'));
  text = text.replace(PHONE, (m) => {
    const n = digitsOf(m).length;
    return n >= 9 && n <= 15 ? hit('phone') : m;
  });
  text = text.replace(LABELLED_BOOKING, (_m, label: string, gap: string) => `${label}${gap}${hit('booking_ref')}`);
  text = text.replace(BOOKING, (m) => (/^KQ\d{3,4}$/.test(m) ? m : hit('booking_ref')));

  return { text, found: [...found] };
}
