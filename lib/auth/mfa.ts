import type { SupabaseClient } from '@supabase/supabase-js';

export type EnrolStart = { ok: true; factorId: string; qr: string; secret: string } | { ok: false; error: string };

// Clears any half-finished enrolment, then starts a new one. Used by first-time enrolment and by
// replacing an authenticator in settings.
export async function newTotpFactor(supabase: SupabaseClient): Promise<EnrolStart> {
  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) return { ok: false, error: 'Sorry, something went wrong. Please try again.' };
  for (const f of factors.data.all.filter((f) => f.factor_type === 'totp' && f.status === 'unverified')) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'KQ Policy Assistant',
    // Names must be unique per user, and a replacement sits next to the old one for a moment.
    friendlyName: `Authenticator app (${new Date().toISOString().slice(0, 19).replace('T', ' ')})`,
  });
  if (error || !data || !data.totp.qr_code.startsWith('data:image/svg+xml')) {
    console.error('MFA enrol failed', error?.code, error?.message);
    return { ok: false, error: 'Sorry, something went wrong. Please try again.' };
  }
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}
