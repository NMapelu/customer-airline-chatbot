"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailIcon } from "@/components/icons";
import { signIn } from "../actions";
import { PasswordField } from "../password-field";
import { Field, FormError, FormTitle, Submit } from "../ui";

export function SignInForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="space-y-5">
      <FormTitle title="Sign in to your account">
        Next you&apos;ll enter a code from your authenticator app.
      </FormTitle>
      {notice && (
        <p role="status" className="notice notice-ok">
          {notice}
        </p>
      )}
      <Field
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="Enter your email"
        icon={<MailIcon />}
        defaultValue={state?.email}
        required
      />
      <div>
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          required
        />
        <p className="mt-2 text-right text-sm">
          <Link href="/forgot-password" className="link">
            Forgot your password?
          </Link>
        </p>
      </div>
      <FormError message={state?.error} />
      <Submit pending={pending}>Sign in</Submit>
      <div
        className="flex items-center gap-3 text-xs text-muted"
        aria-hidden="true"
      >
        <span className="h-px flex-1 bg-[var(--line)]" />
        or
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="link">
          Create an account
        </Link>
      </p>
    </form>
  );
}
