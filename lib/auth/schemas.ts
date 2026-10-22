import { z } from 'zod';

// Form rules, checked on the server before anything reaches Supabase Auth. The password rule
// matches the Supabase setting (12 characters, lower and upper case letters and digits), so a
// password the form accepts is never rejected later. Supabase enforces it too.
export const PASSWORD_MIN = 12;
export const PASSWORD_RULE = `at least ${PASSWORD_MIN} characters, with upper and lower case letters and a digit`;

export const emailSchema = z.email().max(254);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN)
  // bcrypt, which Supabase uses, only reads the first 72 bytes.
  .refine((p) => new TextEncoder().encode(p).length <= 72)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/\d/);

export const signUpSchema = z
  .object({ email: emailSchema, password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'] });

// An invited agent choosing their password (US-32).
export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'] });

export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

// A 6-digit authenticator code. Spaces are allowed, because apps often show "123 456".
export const codeSchema = z
  .string()
  .transform((s) => s.replace(/\s/g, ''))
  .pipe(z.string().regex(/^\d{6}$/));

export const factorIdSchema = z.uuid();
