"use client";

import { useState, type ComponentProps } from "react";
import { EyeIcon, EyeOffIcon, LockIcon } from "@/components/icons";

// A password box with a lock icon and a button that shows or hides what was typed, so people can
// check a long password before sending it.
export function PasswordField({
  label,
  ...input
}: { label: string } & Omit<ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <span className="relative mt-1.5 block">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
          <LockIcon />
        </span>
        <input
          className="input input-lg pr-11 pl-10"
          type={shown ? "text" : "password"}
          {...input}
        />
        <button
          type="button"
          onClick={() => setShown(!shown)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className="absolute inset-y-0 right-1 my-auto flex size-9 items-center justify-center rounded-md text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
        >
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </span>
    </label>
  );
}
